import path from 'node:path';
import { globFiles, readFileSafe, writeFileAtomic } from '../utils/file-system.js';

export interface LoopDecisionEvidence {
  loopId: string;
  summary: string;
  diff: string;
}

export interface DecisionEntry {
  title: string;
  evidence: string;
  loopId?: string;
}

export interface AppendDecisionEntriesOptions {
  projectDir: string;
  decisions: DecisionEntry[];
}

export interface CodingPattern {
  name: string;
  files: string[];
}

export interface ExtractCodingPatternsOptions {
  projectDir: string;
}

export interface WritePatternsDocumentOptions {
  projectDir: string;
  patterns: CodingPattern[];
}

export interface KnowledgeDocumentWriteResult {
  outputPath: string;
  content: string;
}

const SOURCE_PATTERNS = ['**/*.{ts,tsx,js,jsx}'];
const SOURCE_IGNORES = [
  '**/node_modules/**',
  '**/dist/**',
  '**/coverage/**',
  '**/.turbo/**',
  '**/.git/**',
  '**/.dev-loop/**',
];

export function detectArchitecturalDecisions(records: LoopDecisionEvidence[]): DecisionEntry[] {
  return records
    .filter(record => hasDecisionLanguage(record.summary) && hasArchitecturalEvidence(record.diff))
    .map(record => ({
      title: normalizeDecisionTitle(record.summary),
      evidence: summarizeDiffEvidence(record.diff),
      loopId: record.loopId,
    }))
    .sort((a, b) => `${a.loopId ?? ''}:${a.title}`.localeCompare(`${b.loopId ?? ''}:${b.title}`));
}

export async function appendDecisionEntries(
  options: AppendDecisionEntriesOptions,
): Promise<KnowledgeDocumentWriteResult> {
  const outputPath = path.join(options.projectDir, '.dev-loop', 'DECISIONS.md');
  const existing = await readFileSafe(outputPath);
  const base = existing.trimEnd() || '# Decisions';
  const sections = options.decisions
    .slice()
    .sort((a, b) => `${a.loopId ?? ''}:${a.title}`.localeCompare(`${b.loopId ?? ''}:${b.title}`))
    .map(renderDecisionEntry);
  const content = [base, ...sections].join('\n\n').trimEnd() + '\n';

  await writeFileAtomic(outputPath, content);

  return { outputPath, content };
}

export async function extractCodingPatterns(
  options: ExtractCodingPatternsOptions,
): Promise<CodingPattern[]> {
  const projectDir = path.resolve(options.projectDir);
  const files = await globFiles(SOURCE_PATTERNS, {
    cwd: projectDir,
    dot: true,
    ignore: SOURCE_IGNORES,
  });
  const namedFunctionExports: string[] = [];
  const typedErrorClasses: string[] = [];

  for (const file of files) {
    const content = await readFileSafe(path.join(projectDir, file));

    if (/\bexport\s+(?:async\s+)?function\s+[A-Za-z_$][\w$]*/.test(content)) {
      namedFunctionExports.push(file);
    }

    if (/\bexport\s+class\s+[A-Za-z_$][\w$]*\s+extends\s+Error\b/.test(content)) {
      typedErrorClasses.push(file);
    }
  }

  return [
    { name: 'Named function exports', files: namedFunctionExports.sort() },
    { name: 'Typed error classes', files: typedErrorClasses.sort() },
  ].filter(pattern => pattern.files.length > 0);
}

export async function writePatternsDocument(
  options: WritePatternsDocumentOptions,
): Promise<KnowledgeDocumentWriteResult> {
  const outputPath = path.join(options.projectDir, '.dev-loop', 'PATTERNS.md');
  const content = renderPatternsDocument(options.patterns);
  await writeFileAtomic(outputPath, content);

  return { outputPath, content };
}

function renderPatternsDocument(patterns: CodingPattern[]): string {
  const lines = [
    '# Patterns',
    '',
    '## Coding Patterns',
    '',
  ];
  const sortedPatterns = patterns
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));

  if (sortedPatterns.length === 0) {
    lines.push('- No coding patterns detected.');
  } else {
    for (const pattern of sortedPatterns) {
      lines.push(`- ${pattern.name}: ${pattern.files.map(file => `\`${file}\``).join(', ')}`);
    }
  }

  lines.push('');
  return lines.join('\n');
}

function renderDecisionEntry(decision: DecisionEntry): string {
  const lines = [
    `## ${decision.title}`,
  ];

  if (decision.loopId) {
    lines.push(`- Loop: \`${decision.loopId}\``);
  }

  lines.push(`- Evidence: ${decision.evidence}`);
  return lines.join('\n');
}

function hasDecisionLanguage(summary: string): boolean {
  return /\b(?:decision|decided|adopt|adopted|choose|chose|introduce|introduced|extract|extracted)\b/i.test(summary);
}

function hasArchitecturalEvidence(diff: string): boolean {
  return /\+\+\+ b\/.*(?:runtime|context|models|config|db|src)\//.test(diff) &&
    /^\+(?:export\s+)?(?:interface|class|type)\s+[A-Za-z_$][\w$]*/m.test(diff);
}

function normalizeDecisionTitle(summary: string): string {
  return summary
    .replace(/^\s*decision\s*:\s*/i, '')
    .trim();
}

function summarizeDiffEvidence(diff: string): string {
  const file = diff
    .split(/\r?\n/)
    .map(line => line.trim())
    .find(line => line.startsWith('+++ b/'))
    ?.replace('+++ b/', '');
  const symbol = diff
    .split(/\r?\n/)
    .map(line => line.trim())
    .find(line => /^\+(?:export\s+)?(?:interface|class|type)\s+[A-Za-z_$][\w$]*/.test(line))
    ?.replace(/^\+/, '');

  return [file, symbol].filter(Boolean).join(' introduced ');
}
