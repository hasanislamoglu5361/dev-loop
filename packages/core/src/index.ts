export {
  loadConfig,
  saveConfig,
  createDefaultConfig,
  applyEnvOverrides,
  mergeDefaults,
} from './config/loader.js';
export type { ConfigWarning, LoadConfigOptions } from './config/loader.js';
export type { DevLoopConfig } from './config/schema.js';

export { checkConfigFile, safeParseWithMessage } from './config/errors.js';
export type { ConfigCheckResult, SafeParseResult } from './config/errors.js';

export {
  DevLoopError,
  ConfigError,
  DatabaseError,
  ModelError,
  VerifierError,
  PlanningError,
  MigrationAbortedError,
} from './errors.js';

export { EventBus } from './events.js';
export type { EventName, EventPayloadMap, Listener } from './events.js';

export type {
  LoopId,
  StepId,
  LoopStep,
  LoopDef,
  ModelProvider,
  ModelRef,
  ModelConfig,
  VerifierConfig,
  MCPServerConfig,
  QualityGate,
  PlanningConfig,
  NotificationConfig,
  GeneratedFile,
  LoopResult,
} from './types.js';

export {
  countTokens,
  countChatTokens,
} from './utils/token-counter.js';

export {
  buildProjectRuntimePaths,
  initProjectRuntime,
} from './context/init-runtime.js';
export type { InitResult } from './context/init-runtime.js';

export {
  DEV_LOOP_GITIGNORE_PATTERNS,
  DEV_LOOP_VSCODE_FILES_EXCLUDE,
  DEV_LOOP_VSCODE_SEARCH_EXCLUDE,
  mergeGitignore,
  mergeVSCodeSettings,
} from './context/init-editor-support.js';
