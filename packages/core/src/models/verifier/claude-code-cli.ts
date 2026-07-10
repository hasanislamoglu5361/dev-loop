import { writeFileAtomic } from '../../utils/file-system.js';
import type { ProcessResult } from '../../utils/process.js';
import { runCliVerifier, type CliVerifierRunOptions } from './cli-runner.js';
import { parseVerifierOutput } from './parser.js';
import type { IVerifier, ReviewParams, ReviewResult } from './types.js';

export interface McpUsageSummary {
  server: string;
  tool: string;
  count: number;
}

export interface ClaudeReviewParams extends ReviewParams {
  diff?: string;
  testOutput?: string;
  uncertainTags?: string[];
  mcpUsage?: McpUsageSummary[];
}

export interface ClaudeCliVerifierOptions {
  runner?: (options: CliVerifierRunOptions) => Promise<ProcessResult>;
  promptFile: string;
  bugsFile?: string;
  timeoutMs?: number;
  allowUnsafeFlags?: boolean;
}

export class ClaudeCodeCliVerifier implements IVerifier {
  readonly id: string = 'claude-code-cli';
  protected readonly command: string = 'claude-code';
  protected readonly options: ClaudeCliVerifierOptions;

  constructor(options: ClaudeCliVerifierOptions) {
    this.options = options;
  }

  async review(params: ClaudeReviewParams): Promise<ReviewResult> {
    const prompt = buildClaudeReviewPrompt(params);
    await writeFileAtomic(this.options.promptFile, prompt);

    const result = await (this.options.runner ?? runCliVerifier)({
      command: this.command,
      promptFile: this.options.promptFile,
      timeoutMs: this.options.timeoutMs,
      allowUnsafeFlags: this.options.allowUnsafeFlags,
    });

    const review = parseVerifierOutput(result.stdout);
    if (this.options.bugsFile && review.findings.length > 0) {
      await writeFileAtomic(this.options.bugsFile, formatBugsMarkdown(review));
    }

    return review;
  }
}

export function buildClaudeReviewPrompt(params: ClaudeReviewParams): string {
  const sections = [
    `# Verifier Review: ${params.featureId}`,
    'Review the implementation for correctness, regressions, missing tests, and unsafe behavior.',
    'Do not claim completion of external ticketing or project-management workflows.',
    '',
    '## Feature Prompt',
    params.prompt,
    '',
    '## Changed Files',
    params.changedFiles.length > 0 ? params.changedFiles.join('\n') : 'No changed files were provided.',
    '',
    '## Diff',
    params.diff ?? 'No diff was provided.',
    '',
    '## Test Output',
    params.testOutput ?? params.commandsRun?.join('\n') ?? 'No test output was provided.',
    '',
    '## Uncertain Tags',
    params.uncertainTags?.join('\n') ?? 'None.',
    '',
    '## MCP Usage',
    (params.mcpUsage ?? []).map(item => `${item.server}.${item.tool}: ${item.count}`).join('\n') || 'None.',
    '',
    'Return one fenced JSON block with bugs, confidence, mcp_score, and uncertain_fields.',
  ];

  return sections.join('\n');
}

function formatBugsMarkdown(review: ReviewResult): string {
  const lines = ['# Auto-managed verifier bugs', ''];
  for (const finding of review.findings) {
    lines.push(`- ${finding.severity}: ${finding.message}`);
  }
  lines.push('');
  return lines.join('\n');
}
