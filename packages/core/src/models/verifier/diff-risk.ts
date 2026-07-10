export interface ParsedDiffHunk {
  header: string;
  added: string[];
  removed: string[];
}

export interface ParsedDiffFile {
  oldPath: string;
  newPath: string;
  hunks: ParsedDiffHunk[];
}

export interface ParsedUnifiedDiff {
  files: ParsedDiffFile[];
}

export interface DiffRiskAnalysis {
  parsed: ParsedUnifiedDiff;
  riskScore: number;
  riskLevel: 'low' | 'medium' | 'high';
  exportedApiAdded: boolean;
  exportedApiRemoved: boolean;
  behaviorChange: boolean;
  summary: string;
}

export function parseUnifiedDiff(diff: string): ParsedUnifiedDiff {
  const files: ParsedDiffFile[] = [];
  let currentFile: ParsedDiffFile | null = null;
  let currentHunk: ParsedDiffHunk | null = null;

  for (const line of diff.split(/\r?\n/)) {
    if (line.startsWith('diff --git ')) {
      currentFile = { oldPath: '', newPath: '', hunks: [] };
      files.push(currentFile);
      currentHunk = null;
      continue;
    }

    if (!currentFile) continue;

    if (line.startsWith('--- ')) {
      currentFile.oldPath = cleanDiffPath(line.slice(4));
      continue;
    }

    if (line.startsWith('+++ ')) {
      currentFile.newPath = cleanDiffPath(line.slice(4));
      continue;
    }

    if (line.startsWith('@@')) {
      currentHunk = { header: line, added: [], removed: [] };
      currentFile.hunks.push(currentHunk);
      continue;
    }

    if (!currentHunk) continue;

    if (line.startsWith('+') && !line.startsWith('+++')) {
      currentHunk.added.push(line.slice(1));
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      currentHunk.removed.push(line.slice(1));
    }
  }

  return { files };
}

export function analyzeDiffRisk(diff: string): DiffRiskAnalysis {
  const parsed = parseUnifiedDiff(diff);
  const added = allLines(parsed, 'added');
  const removed = allLines(parsed, 'removed');
  const exportedApiAdded = added.some(isExportedApiLine);
  const exportedApiRemoved = removed.some(isExportedApiLine);
  const behaviorChange = added.concat(removed).some(isBehaviorLine);
  const formattingOnly = isFormattingOnly(added, removed);

  let riskScore = formattingOnly ? 10 : 20;
  if (exportedApiAdded) riskScore = Math.max(riskScore, 45);
  if (behaviorChange) riskScore = Math.max(riskScore, 55);
  if (exportedApiRemoved) riskScore = Math.max(riskScore, 85);

  const riskLevel = riskScore >= 80 ? 'high' : riskScore >= 50 ? 'medium' : 'low';
  const summary = summarize({ exportedApiAdded, exportedApiRemoved, behaviorChange, formattingOnly });

  return {
    parsed,
    riskScore,
    riskLevel,
    exportedApiAdded,
    exportedApiRemoved,
    behaviorChange,
    summary,
  };
}

function allLines(parsed: ParsedUnifiedDiff, key: 'added' | 'removed'): string[] {
  return parsed.files.flatMap(file => file.hunks.flatMap(hunk => hunk[key]));
}

function cleanDiffPath(value: string): string {
  return value.replace(/^[ab]\//, '').trim();
}

function isExportedApiLine(line: string): boolean {
  return /^\s*export\s+(async\s+)?(function|class|const|let|var|interface|type|enum)\b/.test(line);
}

function isBehaviorLine(line: string): boolean {
  return /\b(return|throw|if|else|switch|case|for|while|try|catch)\b/.test(line);
}

function isFormattingOnly(added: string[], removed: string[]): boolean {
  if (added.length !== removed.length || added.length === 0) return false;
  return added.every((line, index) => normalizeCode(line) === normalizeCode(removed[index] ?? ''));
}

function normalizeCode(line: string): string {
  return line.replace(/\s+/g, '');
}

function summarize(input: {
  exportedApiAdded: boolean;
  exportedApiRemoved: boolean;
  behaviorChange: boolean;
  formattingOnly: boolean;
}): string {
  const parts: string[] = [];
  if (input.formattingOnly) parts.push('formatting-only change');
  if (input.exportedApiAdded) parts.push('added exported API');
  if (input.exportedApiRemoved) parts.push('removed exported API');
  if (input.behaviorChange) parts.push('return/throw/control-flow change');
  return parts.length > 0 ? parts.join('; ') : 'low semantic risk change';
}
