export type InjectionSeverity = 'none' | 'medium' | 'high' | 'critical';
export type InjectionIssueKind =
  | 'instruction_override'
  | 'destructive_shell'
  | 'destructive_sql'
  | 'secret_exfiltration'
  | 'safety_bypass'
  | 'validation_bypass';

export interface InjectionIssue {
  kind: InjectionIssueKind;
  severity: Exclude<InjectionSeverity, 'none'>;
  message: string;
  snippet: string;
  index: number;
}

export interface InjectionDetectionResult {
  detected: boolean;
  severity: InjectionSeverity;
  issues: InjectionIssue[];
  disabled?: boolean;
}

export interface InjectionScanOptions {
  enabled?: boolean;
}

interface InjectionPattern {
  kind: InjectionIssueKind;
  severity: Exclude<InjectionSeverity, 'none'>;
  message: string;
  pattern: RegExp;
}

const SNIPPET_MAX_LENGTH = 120;

const INJECTION_PATTERNS: InjectionPattern[] = [
  {
    kind: 'instruction_override',
    severity: 'critical',
    message: 'External content attempts to override prior or system instructions.',
    pattern: /\b(?:ignore|disregard|forget)\s+(?:all\s+)?(?:previous|prior|above)\s+instructions?\b/i,
  },
  {
    kind: 'destructive_shell',
    severity: 'critical',
    message: 'External content requests a destructive shell command.',
    pattern: /\b(?:sudo\s+)?rm\s+-rf\s+(?:\/|\*|~|\$HOME)(?:\s|$|[.;])/i,
  },
  {
    kind: 'destructive_sql',
    severity: 'critical',
    message: 'External content requests destructive SQL.',
    pattern: /\b(?:drop\s+table|truncate\s+table|delete\s+from\s+[a-z_][\w.]*)\b/i,
  },
  {
    kind: 'secret_exfiltration',
    severity: 'high',
    message: 'External content attempts to reveal hidden prompts or secrets.',
    pattern: /\b(?:reveal|print|dump|show)\s+(?:the\s+)?(?:hidden\s+)?(?:system\s+prompt|developer\s+message|secrets?|api\s+keys?)\b/i,
  },
  {
    kind: 'safety_bypass',
    severity: 'high',
    message: 'External content attempts to disable safety controls.',
    pattern: /\bdisable\s+(?:all\s+)?(?:safety|security)\s+(?:checks|controls|filters)\b/i,
  },
  {
    kind: 'validation_bypass',
    severity: 'medium',
    message: 'External content attempts to bypass validation or guardrails.',
    pattern: /\bbypass\s+(?:validation|security|guardrails?|review)\b/i,
  },
];

export function scanMcpInputForInjection(
  content: string,
  options: InjectionScanOptions = {},
): InjectionDetectionResult {
  if (options.enabled === false) {
    return {
      detected: false,
      severity: 'none',
      issues: [],
      disabled: true,
    };
  }

  return {
    ...detectPromptInjection(content),
    disabled: false,
  };
}

export function detectPromptInjection(content: string): InjectionDetectionResult {
  const issues: InjectionIssue[] = [];

  for (const injectionPattern of INJECTION_PATTERNS) {
    const match = injectionPattern.pattern.exec(content);
    if (!match) continue;

    issues.push({
      kind: injectionPattern.kind,
      severity: injectionPattern.severity,
      message: injectionPattern.message,
      snippet: extractSnippet(content, match.index, match[0].length),
      index: match.index,
    });
  }

  const severity = highestSeverity(issues);

  return {
    detected: issues.length > 0,
    severity,
    issues,
  };
}

function extractSnippet(content: string, index: number, matchLength: number): string {
  const halfWindow = Math.floor((SNIPPET_MAX_LENGTH - matchLength) / 2);
  const start = Math.max(0, index - Math.max(halfWindow, 0));
  const end = Math.min(content.length, start + SNIPPET_MAX_LENGTH);
  const prefix = start > 0 ? '...' : '';
  const suffix = end < content.length ? '...' : '';
  const rawSnippet = `${prefix}${content.slice(start, end)}${suffix}`;

  return rawSnippet
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, SNIPPET_MAX_LENGTH);
}

function highestSeverity(issues: InjectionIssue[]): InjectionSeverity {
  if (issues.some(issue => issue.severity === 'critical')) return 'critical';
  if (issues.some(issue => issue.severity === 'high')) return 'high';
  if (issues.some(issue => issue.severity === 'medium')) return 'medium';
  return 'none';
}
