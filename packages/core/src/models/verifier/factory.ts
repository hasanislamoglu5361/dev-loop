import { ClaudeCodeCliVerifier, type ClaudeCliVerifierOptions } from './claude-code-cli.js';
import { ClaudeCliVerifier } from './claude-cli.js';
import { CodexCliVerifier, type CodexCliVerifierOptions } from './codex-cli.js';
import { ApiVerifier, type ApiVerifierOptions } from './api-verifier.js';
import type { IVerifier } from './types.js';

/**
 * Configuration for selecting and constructing one of the concrete `IVerifier`
 * implementations. Named `VerifierFactoryConfig` (not `VerifierConfig`) to avoid
 * colliding with the pre-existing, unrelated `VerifierConfig` quality-gate type
 * exported from `src/types.ts` (unit-test/integration-test/lint/typecheck).
 */
export type VerifierFactoryConfig =
  | { kind: 'claude-code-cli'; options: ClaudeCliVerifierOptions }
  | { kind: 'claude-cli'; options: ClaudeCliVerifierOptions }
  | { kind: 'codex-cli'; options: CodexCliVerifierOptions }
  | { kind: 'api-verifier'; options: ApiVerifierOptions };

export function createVerifier(config: VerifierFactoryConfig): IVerifier {
  switch (config.kind) {
    case 'claude-code-cli':
      return new ClaudeCodeCliVerifier(config.options);
    case 'claude-cli':
      return new ClaudeCliVerifier(config.options);
    case 'codex-cli':
      return new CodexCliVerifier(config.options);
    case 'api-verifier':
      return new ApiVerifier(config.options);
    default: {
      const exhaustive: never = config;
      throw new Error(`Unknown verifier kind: ${JSON.stringify(exhaustive)}`);
    }
  }
}
