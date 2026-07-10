import { ModelError } from '../errors.js';
import type {
  GenerateParams,
  GenerateResult,
  ModelInfo,
  ModelProvider,
  ModelProviderId,
  ModelStreamEvent,
  ProviderHealth,
  ProviderHealthStatus,
} from './types.js';

export interface BaseModelProviderOptions {
  id: string;
  provider: ModelProviderId;
  isLocal: boolean;
}

export interface CreateHealthCheckOptions {
  ok: boolean;
  status?: ProviderHealthStatus;
  latencyMs?: number;
  message?: string;
  details?: Record<string, unknown>;
}

export class BaseModelProvider implements ModelProvider {
  readonly id: string;
  readonly provider: ModelProviderId;
  readonly isLocal: boolean;

  constructor(options: BaseModelProviderOptions) {
    this.id = assertNonBlank(options.id, 'id');
    this.provider = assertNonBlank(options.provider, 'provider');
    this.isLocal = options.isLocal;
  }

  async listModels(): Promise<ModelInfo[]> {
    throw new ModelError(
      `Model provider ${this.id} does not implement listModels().`,
      'Implement listModels() on the provider before using it.',
      { providerId: this.id, provider: this.provider },
    );
  }

  async healthCheck(): Promise<ProviderHealth> {
    return this.createHealthCheck({
      ok: false,
      status: 'unavailable',
      message: `Model provider ${this.id} does not implement healthCheck().`,
    });
  }

  async generate(_params: GenerateParams): Promise<GenerateResult> {
    throw new ModelError(
      `Model provider ${this.id} does not implement generate().`,
      'Implement generate() on the provider before using it.',
      { providerId: this.id, provider: this.provider },
    );
  }

  protected createHealthCheck(options: CreateHealthCheckOptions): ProviderHealth {
    return {
      ok: options.ok,
      status: options.status ?? (options.ok ? 'healthy' : 'unavailable'),
      providerId: this.id,
      checkedAt: new Date(),
      ...(options.latencyMs !== undefined ? { latencyMs: options.latencyMs } : {}),
      ...(options.message !== undefined ? { message: options.message } : {}),
      ...(options.details !== undefined ? { details: options.details } : {}),
    };
  }
}

function assertNonBlank(value: string, field: 'id' | 'provider'): string {
  if (value.trim().length === 0) {
    throw new ModelError(
      `Model provider ${field} is required.`,
      `Pass a non-empty model provider ${field}.`,
      { field },
    );
  }

  return value;
}

export type { GenerateParams, GenerateResult, ModelInfo, ModelStreamEvent, ProviderHealth };
