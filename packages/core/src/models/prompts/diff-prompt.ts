export interface RetryPromptBug {
  severity: 'info' | 'warning' | 'error';
  message: string;
  file?: string;
  line?: number;
}

export interface RetryPromptSemanticAnalysis {
  riskLevel: 'low' | 'medium' | 'high';
  riskScore: number;
  summary: string;
}

export interface DiffAwareRetryPromptOptions {
  featureId: string;
  turn: number;
  originalPrompt: string;
  previousDiff: string;
  semanticAnalysis: RetryPromptSemanticAnalysis;
  remainingBugs: RetryPromptBug[];
  uncertainTags?: string[];
}

export function buildDiffAwareRetryPrompt(options: DiffAwareRetryPromptOptions): string {
  return [
    `# ${options.featureId} Retry turn ${options.turn}`,
    '',
    'Fix only the listed issues. Do not rewrite unrelated code or broaden scope.',
    'Make the smallest necessary follow-up change.',
    'If you cannot prove a claim, write TODO:UNCERTAIN with the reason.',
    '',
    '## Original Requirement',
    options.originalPrompt,
    '',
    '## Previous Diff',
    options.previousDiff || 'No previous diff was provided.',
    '',
    '## Semantic Risk Analysis',
    `- Risk: ${options.semanticAnalysis.riskLevel} (${options.semanticAnalysis.riskScore})`,
    `- Summary: ${options.semanticAnalysis.summary}`,
    '',
    '## Remaining Bugs',
    formatBugs(options.remainingBugs),
    '',
    '## Uncertain Tags',
    options.uncertainTags?.length ? options.uncertainTags.map(tag => `- ${tag}`).join('\n') : '- None.',
    '',
    '## Expected File Output Format',
    'Return changed files as fenced blocks with the file path before each block.',
    '```json',
    '{"files":[{"path":"relative/path.ts","content":"..."}]}',
    '```',
  ].join('\n');
}

function formatBugs(bugs: RetryPromptBug[]): string {
  if (bugs.length === 0) return 'No remaining verifier bugs were provided.';
  return bugs
    .map(bug => {
      const location = bug.file ? `${bug.file}${bug.line !== undefined ? `:${bug.line}` : ''}` : 'unknown file';
      return `- ${bug.severity} ${location}: ${bug.message}`;
    })
    .join('\n');
}
