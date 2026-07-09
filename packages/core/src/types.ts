// Shared domain types for dev-loop core modules
// Stable, reusable types used across loop, model, verifier, MCP, quality, planning, notifications

/**
 * Loop configuration and definition types
 */
export type LoopId = string;
export type StepId = string;

export interface LoopStep {
  id: StepId;
  name: string;
  prompt: string;
  model?: ModelRef;
  verifier?: VerifierConfig;
}

export interface LoopDef {
  id: LoopId;
  name: string;
  description?: string;
  version?: string;
  model: ModelRef | string;
  steps: LoopStep[];
  config?: Record<string, unknown>;
}

/**
 * Model reference and configuration types
 */
export type ModelProvider = 'openai' | 'anthropic' | 'local' | 'custom';

export interface ModelRef {
  provider: ModelProvider;
  model: string;
  temperature?: number;
  maxTokens?: number;
}

export interface ModelConfig extends ModelRef {
  apiKey?: string;
  baseUrl?: string;
  timeout?: number;
  retryAttempts?: number;
}

/**
 * Verifier configuration types
 */
export type VerifierType = 'unit-test' | 'integration-test' | 'lint' | 'typecheck';

export interface VerifierConfig {
  type: VerifierType;
  command?: string[];
  pattern?: string;
}

/**
 * MCP (Model Context Protocol) server configuration types
 */
export interface MCPServerConfig {
  name: string;
  url: string;
  transport?: 'stdio' | 'http';
  args?: string[];
  env?: Record<string, string>;
}

export type MCPServerStatus = 'idle' | 'running' | 'error' | 'disconnected';

/**
 * Quality gate types
 */
export interface QualityGate {
  passRate: number; // percentage (0-100)
  minComplexityScore?: number;
  maxCognitiveComplexity?: number;
}

export type QualityResult = 'pass' | 'fail';

/**
 * Planning configuration types
 */
export interface PlanningConfig {
  maxIterations: number;
  strategy: 'sequential' | 'parallel' | 'adaptive';
  timeoutMs?: number;
}

/**
 * Notification configuration types
 */
export type NotificationChannel = 'terminal' | 'file' | 'webhook';

export interface NotificationConfig {
  channels: NotificationChannel[];
  level?: 'info' | 'warn' | 'error';
}

/**
 * Generated file metadata types
 */
export interface GeneratedFile {
  path: string;
  content: string;
  language?: string;
  overwrite: boolean;
}

/**
 * Loop execution result
 */
export interface LoopResult {
  loopId: LoopId;
  success: boolean;
  stepsExecuted: number;
  errors?: Error[];
  durationMs?: number;
}

/**
 * DevLoop manifest type (used for project scaffolding)
 */
export interface DevLoopManifest {
  name: string;
  version: string;
  loops: LoopDef[];
  models: ModelConfig[];
  qualityGates: QualityGate[];
}