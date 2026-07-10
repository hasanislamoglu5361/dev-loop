import { DevLoopError } from '../errors.js';
import type { RegisteredModel } from './registry.js';
import type { VramInfo } from './vram.js';

export interface SelectorCandidate extends RegisteredModel {
  estimatedVramMb?: number;
  tokensPerSecond?: number;
}

export interface ModelSelection {
  providerId: string;
  modelId: string;
  model: SelectorCandidate;
  reason: 'task-override' | 'local-vram' | 'history' | 'cheapest-cloud';
}

export interface RepeatedFailureSelection extends ModelSelection {
  switched: boolean;
}

export interface AutoModelSelectorOptions {
  registry: {
    listModels(): Promise<SelectorCandidate[]>;
  };
  vram: {
    detect(): Promise<VramInfo>;
  };
  history?: {
    getBestModel(context: {
      featureType?: string;
      language?: string;
      maxCostPer1kTokens?: number;
      minSuccessRate: number;
      minSamples: number;
      exclude: string[];
    }): Promise<{ providerId: string; modelId: string; successRate: number } | null>;
    countRecentFailures(ref: { providerId: string; modelId: string }, options: { withinLoops: number }): Promise<number>;
  };
  confirmSwitch?: (message: string) => Promise<boolean> | boolean;
}

export interface SelectModelContext {
  taskOverride?: { providerId?: string; modelId?: string };
  preferLocal?: boolean;
  preferCheapest?: boolean;
  featureType?: string;
  language?: string;
  maxCostPer1kTokens?: number;
  minContextWindow?: number;
  failedModelIds?: string[];
}

export interface RepeatedFailureContext extends SelectModelContext {
  current: { providerId: string; modelId: string };
  failureThreshold: number;
  autoConfirmSwitch: boolean;
  withinLoops?: number;
}

export class ModelSelectionError extends DevLoopError {
  constructor(message: string, action: string, details?: Record<string, unknown>) {
    super(message, 'model.selection', action, details);
    this.name = 'ModelSelectionError';
  }
}

export class AutoModelSelector {
  private readonly registry: AutoModelSelectorOptions['registry'];
  private readonly vram: AutoModelSelectorOptions['vram'];
  private readonly history?: AutoModelSelectorOptions['history'];
  private readonly confirmSwitch?: AutoModelSelectorOptions['confirmSwitch'];

  constructor(options: AutoModelSelectorOptions) {
    this.registry = options.registry;
    this.vram = options.vram;
    this.history = options.history;
    this.confirmSwitch = options.confirmSwitch;
  }

  async selectModel(context: SelectModelContext = {}): Promise<ModelSelection> {
    const failed = new Set(context.failedModelIds ?? []);
    const models = await this.registry.listModels();

    const override = this.selectOverride(models, context, failed);
    if (override) return override;

    if (context.preferLocal ?? true) {
      const local = await this.selectLocal(models, context, failed);
      if (local) return local;
    }

    const historical = await this.selectHistorical(models, context, failed);
    if (historical) return historical;

    const cheapest = this.selectCheapestCloud(models, context, failed);
    if (cheapest) return cheapest;

    throw new ModelSelectionError(
      'No model candidate could be selected.',
      'Register at least one provider/model or relax selector filters such as failedModelIds, VRAM, or context window.',
      { failedModelIds: Array.from(failed), candidateCount: models.length },
    );
  }

  async handleRepeatedFailure(context: RepeatedFailureContext): Promise<RepeatedFailureSelection> {
    const failures = await this.history?.countRecentFailures(context.current, {
      withinLoops: context.withinLoops ?? 5,
    }) ?? 0;

    const currentModel = await this.findCurrentModel(context.current);
    if (failures < context.failureThreshold) {
      return { ...currentModel, switched: false };
    }

    const alternative = await this.selectModel({
      ...context,
      failedModelIds: [...(context.failedModelIds ?? []), context.current.modelId],
      taskOverride: undefined,
    });

    if (!context.autoConfirmSwitch) {
      const confirmed = await this.confirmSwitch?.(
        `Switch model from ${context.current.modelId} to ${alternative.modelId}?`,
      );
      if (!confirmed) {
        return { ...currentModel, switched: false };
      }
    }

    return { ...alternative, switched: true };
  }

  private selectOverride(
    models: SelectorCandidate[],
    context: SelectModelContext,
    failed: Set<string>,
  ): ModelSelection | null {
    const providerId = context.taskOverride?.providerId;
    const modelId = context.taskOverride?.modelId;
    if (!providerId || !modelId || modelId === 'auto') return null;
    if (failed.has(modelId)) return null;

    const model = models.find(candidate => candidate.providerId === providerId && candidate.id === modelId);
    if (!model) {
      throw new ModelSelectionError(
        `Task override model ${providerId}/${modelId} is not available.`,
        'Register the override provider/model or remove the task override.',
        { providerId, modelId },
      );
    }

    return { providerId, modelId, model, reason: 'task-override' };
  }

  private async selectLocal(
    models: SelectorCandidate[],
    _context: SelectModelContext,
    failed: Set<string>,
  ): Promise<ModelSelection | null> {
    const vram = await this.vram.detect();
    const local = models
      .filter(model => !failed.has(model.id))
      .filter(model => model.isLocal || model.providerId === 'lmstudio' || model.providerId === 'ollama')
      .filter(model => (model.estimatedVramMb ?? 0) <= vram.availableMb)
      .sort((left, right) => (right.tokensPerSecond ?? 0) - (left.tokensPerSecond ?? 0))[0];

    return local ? { providerId: local.providerId, modelId: local.id, model: local, reason: 'local-vram' } : null;
  }

  private async selectHistorical(
    models: SelectorCandidate[],
    context: SelectModelContext,
    failed: Set<string>,
  ): Promise<ModelSelection | null> {
    const historical = await this.history?.getBestModel({
      featureType: context.featureType,
      language: context.language,
      maxCostPer1kTokens: context.maxCostPer1kTokens,
      minSuccessRate: 0.6,
      minSamples: 3,
      exclude: Array.from(failed),
    });
    if (!historical || failed.has(historical.modelId)) return null;

    const model = models.find(candidate => candidate.providerId === historical.providerId && candidate.id === historical.modelId);
    return model ? { providerId: historical.providerId, modelId: historical.modelId, model, reason: 'history' } : null;
  }

  private selectCheapestCloud(
    models: SelectorCandidate[],
    context: SelectModelContext,
    failed: Set<string>,
  ): ModelSelection | null {
    const minContextWindow = context.minContextWindow ?? 0;
    const cloud = models
      .filter(model => !failed.has(model.id))
      .filter(model => !(model.isLocal || model.providerId === 'lmstudio' || model.providerId === 'ollama'))
      .filter(model => (model.contextWindow ?? 0) >= minContextWindow)
      .filter(model => costPer1k(model) <= (context.maxCostPer1kTokens ?? Number.POSITIVE_INFINITY))
      .sort((left, right) => costPer1k(left) - costPer1k(right))[0];

    return cloud ? { providerId: cloud.providerId, modelId: cloud.id, model: cloud, reason: 'cheapest-cloud' } : null;
  }

  private async findCurrentModel(current: { providerId: string; modelId: string }): Promise<ModelSelection> {
    const models = await this.registry.listModels();
    const model = models.find(candidate => candidate.providerId === current.providerId && candidate.id === current.modelId);
    if (!model) {
      throw new ModelSelectionError(
        `Current model ${current.providerId}/${current.modelId} is not available.`,
        'Register the current provider/model before handling repeated failures.',
        current,
      );
    }

    return { providerId: current.providerId, modelId: current.modelId, model, reason: 'cheapest-cloud' };
  }
}

function costPer1k(model: SelectorCandidate): number {
  const input = model.inputCostPer1M ?? Number.POSITIVE_INFINITY;
  const output = model.outputCostPer1M ?? Number.POSITIVE_INFINITY;
  return (input + output) / 1000;
}
