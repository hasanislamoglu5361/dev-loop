import { ClaudeCodeCliVerifier, type ClaudeCliVerifierOptions } from './claude-code-cli.js';

export class ClaudeCliVerifier extends ClaudeCodeCliVerifier {
  override readonly id = 'claude-cli';
  protected override readonly command = 'claude';

  constructor(options: ClaudeCliVerifierOptions) {
    super(options);
  }
}
