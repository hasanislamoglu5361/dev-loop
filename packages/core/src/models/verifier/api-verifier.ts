import type { ModelProvider } from '../types.js';
import { parseVerifierOutput } from './parser.js';
import type { IVerifier, ReviewParams, ReviewResult } from './types.js';

export interface VerifierPromptParams extends ReviewParams {
  diff?: string;
  testOutput?: string;
  uncertainTags?: string[];
}

export interface ApiVerifierOptions {
  provider: ModelProvider;
  model: string;
}

export interface SqlReportTranslation {
  ok: boolean;
  sql?: string;
  reason?: string;
}

export class ApiVerifier implements IVerifier {
  readonly id = 'api-verifier';
  private readonly provider: ModelProvider;
  private readonly model: string;

  constructor(options: ApiVerifierOptions) {
    this.provider = options.provider;
    this.model = options.model;
  }

  async review(params: ReviewParams): Promise<ReviewResult> {
    const result = await this.provider.generate({
      model: this.model,
      messages: [{ role: 'user', content: buildVerifierPrompt(params as VerifierPromptParams) }],
    });
    return parseVerifierOutput(result.text);
  }
}

export function buildVerifierPrompt(params: VerifierPromptParams): string {
  return [
    `# Verifier Review: ${params.featureId}`,
    params.prompt,
    '',
    '## Changed Files',
    params.changedFiles.join('\n') || 'None.',
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
    'Return a fenced JSON verifier result.',
  ].join('\n');
}

export function translateSqlRequestToReport(sql: string): SqlReportTranslation {
  const normalized = sql.trim();
  if (!/^select\b/i.test(normalized)) {
    return {
      ok: false,
      reason: 'Only SELECT statements are allowed for verifier reporting.',
    };
  }

  return { ok: true, sql: normalized };
}
