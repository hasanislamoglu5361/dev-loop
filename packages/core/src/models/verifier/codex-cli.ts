import { writeFileAtomic } from '../../utils/file-system.js';
import type { ProcessResult } from '../../utils/process.js';
import { runCliVerifier, type CliVerifierRunOptions } from './cli-runner.js';
import { buildVerifierPrompt } from './api-verifier.js';
import { parseVerifierOutput } from './parser.js';
import type { IVerifier, ReviewParams, ReviewResult } from './types.js';

export interface CodexCliVerifierOptions {
  runner?: (options: CliVerifierRunOptions) => Promise<ProcessResult>;
  promptFile: string;
  timeoutMs?: number;
  allowUnsafeFlags?: boolean;
}

export class CodexCliVerifier implements IVerifier {
  readonly id = 'codex-cli';
  private readonly options: CodexCliVerifierOptions;

  constructor(options: CodexCliVerifierOptions) {
    this.options = options;
  }

  async review(params: ReviewParams): Promise<ReviewResult> {
    await writeFileAtomic(this.options.promptFile, buildVerifierPrompt(params));
    const result = await (this.options.runner ?? runCliVerifier)({
      command: 'codex',
      promptFile: this.options.promptFile,
      timeoutMs: this.options.timeoutMs,
      allowUnsafeFlags: this.options.allowUnsafeFlags,
    });

    return parseVerifierOutput(result.stdout);
  }
}
