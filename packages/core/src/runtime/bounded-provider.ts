import type { ModelProvider, GenerateParams, GenerateResult, ModelInfo, ProviderHealth } from '../models/types.js';

/**
 * Bounded adapter wrappers that impose a hard timeout on the underlying
 * `ModelProvider.generate()` and `ModelProvider.listModels()` calls so the
 * production runtime cannot leak unbounded network work to LM Studio, Ollama,
 * OpenAI, Anthropic, OpenRouter or Google adapters.
 *
 * The default `timeoutMs` for `generate()` falls back to
 * `params.timeoutMs ?? 30_000`; both can be lowered per call for tests.
 */
export interface BoundedProviderOptions {
  timeoutMs?: number;
  listModelsTimeoutMs?: number;
}

export interface BoundedProvider extends ModelProvider {
  readonly bounded: true;
  readonly sourceProvider: ModelProvider;
  readonly generationCount: () => number;
  readonly listModelsCount: () => number;
  readonly dispose: () => Promise<void>;
}

const DEFAULT_TIMEOUT_MS = 30_000;

export function boundedProvider(provider: ModelProvider, options: BoundedProviderOptions = {}): BoundedProvider {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const listModelsTimeoutMs = options.listModelsTimeoutMs ?? 10_000;
  let disposed = false;
  let generations = 0;
  let modelCalls = 0;
  const inflight = new Set<AbortController>();

  const dispose = async (): Promise<void> => {
    disposed = true;
    for (const controller of inflight) controller.abort();
    inflight.clear();
    await (provider as { dispose?: () => Promise<void> }).dispose?.();
  };

  const runBounded = async <T>(label: string, ms: number, fn: () => Promise<T>): Promise<T> => {
    if (disposed) throw new Error(`Bounded provider ${provider.id} is disposed (${label}).`);
    const controller = new AbortController();
    inflight.add(controller);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error(`Bounded provider ${provider.id} ${label} exceeded ${ms}ms.`));
        }, ms);
      });
      return await Promise.race([fn(), timeout]);
    } finally {
      if (timer) clearTimeout(timer);
      inflight.delete(controller);
    }
  };

  return {
    id: provider.id,
    provider: provider.provider,
    isLocal: provider.isLocal,
    bounded: true,
    sourceProvider: provider,
    generationCount: () => generations,
    listModelsCount: () => modelCalls,
    dispose,
    listModels: () => {
      modelCalls += 1;
      return runBounded('listModels', listModelsTimeoutMs, () => provider.listModels());
    },
    healthCheck: () => runBounded('healthCheck', 5_000, () => provider.healthCheck()),
    generate: (params: GenerateParams) => {
      generations += 1;
      return runBounded('generate', params.timeoutMs ?? timeoutMs, async () => {
        const result = await provider.generate(params);
        return finalizeGenerate(result);
      });
    },
  };
}

function finalizeGenerate(result: GenerateResult): GenerateResult {
  return {
    ...result,
    files: Array.isArray(result.files) ? result.files : [],
  };
}

export type { ModelInfo, ProviderHealth };
