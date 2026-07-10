export type ModelProviderId = string;

export type ModelMessageRole = 'system' | 'user' | 'assistant' | 'tool';

export interface ModelMessage {
  role: ModelMessageRole;
  content: string;
  name?: string;
  metadata?: Record<string, unknown>;
}
export interface ModelInputFile {
  path: string;
  content?: string;
  mimeType?: string;
  metadata?: Record<string, unknown>;
}

export interface ModelGeneratedFile {
  path: string;
  content: string;
  language?: string;
  overwrite?: boolean;
  metadata?: Record<string, unknown>;
}

export interface ModelInfo {
  id: string;
  name: string;
  provider: ModelProviderId;
  contextWindow?: number;
  maxOutputTokens?: number;
  supportsStreaming?: boolean;
  supportsTools?: boolean;
  isLocal?: boolean;
  inputCostPer1M?: number;
  outputCostPer1M?: number;
  metadata?: Record<string, unknown>;
}

export interface GenerateParams {
  model: string;
  messages: ModelMessage[];
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  files?: ModelInputFile[];
  metadata?: Record<string, unknown>;
}

export type GenerateFinishReason = 'stop' | 'length' | 'tool-call' | 'content-filter' | 'error' | 'unknown';

export interface GenerateResult {
  text: string;
  files: ModelGeneratedFile[];
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  durationMs?: number;
  costUsd?: number;
  finishReason?: GenerateFinishReason;
  raw?: unknown;
  metadata?: Record<string, unknown>;
}

export type ModelStreamEvent =
  | { type: 'text-delta'; text: string }
  | { type: 'file'; file: ModelGeneratedFile }
  | { type: 'usage'; inputTokens?: number; outputTokens?: number; costUsd?: number }
  | { type: 'error'; error: Error }
  | { type: 'done'; result: GenerateResult };

export type ProviderHealthStatus = 'healthy' | 'degraded' | 'unavailable';

export interface ProviderHealth {
  ok: boolean;
  status: ProviderHealthStatus;
  providerId: string;
  checkedAt: Date;
  latencyMs?: number;
  message?: string;
  details?: Record<string, unknown>;
}

export interface ModelProvider {
  readonly id: string;
  readonly provider: ModelProviderId;
  readonly isLocal: boolean;

  listModels(): Promise<ModelInfo[]>;
  healthCheck(): Promise<ProviderHealth>;
  generate(params: GenerateParams): Promise<GenerateResult>;
  streamGenerate?(params: GenerateParams): AsyncIterable<ModelStreamEvent>;
}
