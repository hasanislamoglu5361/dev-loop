import { ProcessError, runProcess } from '../utils/process.js';
import type { SpawnLike } from '../utils/process.js';

export type QualityCheckKind =
  | 'vulnerability'
  | 'coverage'
  | 'lint'
  | 'typecheck'
  | 'secrets'
  | 'uncertain'
  | 'mcp';
export type QualityCheckStatus = 'passed' | 'failed' | 'timed_out' | 'skipped';

export interface QualityCheckConfig {
  kind: QualityCheckKind;
  enabled?: boolean;
  command?: string;
  args?: string[];
  timeoutSeconds?: number;
  timeout_seconds?: number;
  blocking?: boolean;
}

export interface QualityCheckRequest {
  check: QualityCheckConfig;
  projectDir: string;
  env?: NodeJS.ProcessEnv;
  spawn?: SpawnLike;
}

export interface VulnerabilitySummary {
  total: number;
  info: number;
  low: number;
  moderate: number;
  high: number;
  critical: number;
}

export interface CoverageSummary {
  statements?: number;
  branches?: number;
  functions?: number;
  lines?: number;
}

export interface QualityMetrics {
  testCoveragePct?: number;
  typeCoveragePct?: number;
  secretsFound?: number;
  vulnerabilitiesCritical?: number;
  vulnerabilitiesHigh?: number;
  lintErrors?: number;
  uncertainTags?: number;
  mcpScore?: number;
}

export interface QualityCheckResult {
  kind: QualityCheckKind;
  enabled: boolean;
  success: boolean;
  status: QualityCheckStatus;
  command?: string;
  args: string[];
  exitCode: number | null;
  stdout: string;
  stderr: string;
  summary: string;
  actionableError?: string;
  vulnerabilities?: VulnerabilitySummary;
  coverage?: CoverageSummary;
  metrics?: QualityMetrics;
}

export interface QualityCheckerContext {
  check: QualityCheckConfig;
  projectDir: string;
  env?: NodeJS.ProcessEnv;
}

export type QualityChecker = (context: QualityCheckerContext) => Promise<QualityCheckResult>;

export interface QualityGateThresholds {
  coverage?: number;
  typeCoverage?: number;
  mcpScore?: number;
}

export interface QualityGateFailure {
  kind: QualityCheckKind;
  reason: string;
  actionableError?: string;
}

export interface QualityGateTrendRecord extends QualityMetrics {
  gatePassed: boolean;
  qualityScore: number;
  failures: QualityGateFailure[];
}

export interface QualityGateNotification {
  kind: 'quality_gate_failed';
  failures: QualityGateFailure[];
  metrics: QualityMetrics;
  qualityScore: number;
  blockCommit: boolean;
}

export interface QualityGateRequest {
  checks: QualityCheckConfig[];
  projectDir: string;
  env?: NodeJS.ProcessEnv;
  spawn?: SpawnLike;
  checkers?: Partial<Record<QualityCheckKind, QualityChecker>>;
  thresholds?: QualityGateThresholds;
  blockCommitOnFailure?: boolean;
  notify?: (event: QualityGateNotification) => Promise<void> | void;
  saveTrend?: (record: QualityGateTrendRecord) => Promise<void> | void;
}

export interface QualityGateResult {
  success: boolean;
  results: QualityCheckResult[];
  failures: QualityGateFailure[];
  metrics: QualityMetrics;
  qualityScore: number;
  blockCommit: boolean;
}

const EMPTY_VULNERABILITY_SUMMARY: VulnerabilitySummary = {
  total: 0,
  info: 0,
  low: 0,
  moderate: 0,
  high: 0,
  critical: 0,
};

export async function runQualityGate(request: QualityGateRequest): Promise<QualityGateResult> {
  const results: QualityCheckResult[] = [];

  for (const check of request.checks) {
    results.push(await runGateCheck(check, request));
  }

  const metrics = collectQualityMetrics(results);
  const failures = collectQualityFailures(results, metrics, request.thresholds);
  const success = failures.length === 0;
  const qualityScore = computeQualityScore(failures);
  const blockCommit = !success && (request.blockCommitOnFailure ?? true);

  const trend: QualityGateTrendRecord = {
    ...metrics,
    gatePassed: success,
    qualityScore,
    failures,
  };
  await request.saveTrend?.(trend);

  if (!success) {
    await request.notify?.({
      kind: 'quality_gate_failed',
      failures,
      metrics,
      qualityScore,
      blockCommit,
    });
  }

  return {
    success,
    results,
    failures,
    metrics,
    qualityScore,
    blockCommit,
  };
}

export async function runQualityCheck(request: QualityCheckRequest): Promise<QualityCheckResult> {
  const enabled = request.check.enabled ?? true;
  const args = request.check.args ?? [];

  if (!enabled) {
    return {
      kind: request.check.kind,
      enabled: false,
      success: true,
      status: 'skipped',
      command: request.check.command,
      args,
      exitCode: 0,
      stdout: '',
      stderr: '',
      summary: `${request.check.kind} check disabled.`,
    };
  }

  if (!request.check.command) {
    throw new Error(`${request.check.kind} check command is required when the check is enabled.`);
  }

  const timeoutSeconds = request.check.timeoutSeconds ?? request.check.timeout_seconds;

  try {
    const processResult = await runProcess(request.check.command, args, {
      cwd: request.projectDir,
      env: request.env,
      spawn: request.spawn,
      timeoutMs: timeoutSeconds === undefined ? undefined : timeoutSeconds * 1000,
    });

    return buildQualityResult({
      kind: request.check.kind,
      enabled,
      command: request.check.command,
      args,
      exitCode: processResult.exitCode,
      stdout: processResult.stdout,
      stderr: processResult.stderr,
      timedOut: false,
    });
  } catch (error) {
    if (error instanceof ProcessError) {
      const timedOut = timeoutSeconds !== undefined && error.exitCode === null;

      return buildQualityResult({
        kind: request.check.kind,
        enabled,
        command: request.check.command,
        args,
        exitCode: error.exitCode,
        stdout: error.stdout,
        stderr: error.stderr,
        timedOut,
        timeoutSeconds,
      });
    }

    throw error;
  }
}

async function runGateCheck(
  check: QualityCheckConfig,
  request: QualityGateRequest,
): Promise<QualityCheckResult> {
  if (check.enabled === false) {
    return skippedQualityCheck(check, `${check.kind} check disabled.`);
  }

  const checker = request.checkers?.[check.kind];
  if (!checker) {
    return runQualityCheck({
      check,
      projectDir: request.projectDir,
      env: request.env,
      spawn: request.spawn,
    });
  }

  try {
    return await checker({
      check,
      projectDir: request.projectDir,
      env: request.env,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (check.blocking === false) {
      return skippedQualityCheck(check, `${check.kind} optional checker failed: ${message}`);
    }

    return {
      kind: check.kind,
      enabled: true,
      success: false,
      status: 'failed',
      command: check.command,
      args: check.args ?? [],
      exitCode: null,
      stdout: '',
      stderr: message,
      summary: `${check.kind} checker failed: ${message}`,
      actionableError: `Fix the ${check.kind} checker or mark it as non-blocking.`,
    };
  }
}

function skippedQualityCheck(check: QualityCheckConfig, summary: string): QualityCheckResult {
  return {
    kind: check.kind,
    enabled: false,
    success: true,
    status: 'skipped',
    command: check.command,
    args: check.args ?? [],
    exitCode: 0,
    stdout: '',
    stderr: '',
    summary,
  };
}

export function parseVulnerabilityOutput(output: string): VulnerabilitySummary {
  const parsed = parseJsonObject(output);
  const vulnerabilities = parsed?.metadata?.vulnerabilities ?? parsed?.vulnerabilities;

  if (isRecord(vulnerabilities)) {
    return {
      total: numberFrom(vulnerabilities.total),
      info: numberFrom(vulnerabilities.info),
      low: numberFrom(vulnerabilities.low),
      moderate: numberFrom(vulnerabilities.moderate),
      high: numberFrom(vulnerabilities.high),
      critical: numberFrom(vulnerabilities.critical),
    };
  }

  const plainTextMatch = output.match(/found\s+(\d+)\s+vulnerabilit(?:y|ies)/i);
  if (plainTextMatch) {
    return {
      ...EMPTY_VULNERABILITY_SUMMARY,
      total: Number(plainTextMatch[1]),
    };
  }

  return EMPTY_VULNERABILITY_SUMMARY;
}

export function parseCoverageOutput(output: string): CoverageSummary {
  const summary: CoverageSummary = {};

  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^\s*(Statements|Branches|Functions|Lines)\s*:?\s+([0-9]+(?:\.[0-9]+)?)%/i);
    if (!match) continue;

    summary[coverageKey(match[1])] = Number(match[2]);
  }

  return summary;
}

function collectQualityMetrics(results: QualityCheckResult[]): QualityMetrics {
  const metrics: QualityMetrics = {};

  for (const result of results) {
    Object.assign(metrics, result.metrics);

    if (result.coverage?.lines !== undefined) {
      metrics.testCoveragePct = result.coverage.lines;
    }

    if (result.vulnerabilities) {
      metrics.vulnerabilitiesCritical = result.vulnerabilities.critical;
      metrics.vulnerabilitiesHigh = result.vulnerabilities.high;
    }
  }

  return metrics;
}

function collectQualityFailures(
  results: QualityCheckResult[],
  metrics: QualityMetrics,
  thresholds: QualityGateThresholds = {},
): QualityGateFailure[] {
  const failures: QualityGateFailure[] = [];

  for (const result of results) {
    if (result.success) continue;

    failures.push({
      kind: result.kind,
      reason: result.summary,
      actionableError: result.actionableError,
    });
  }

  if (
    thresholds.coverage !== undefined &&
    metrics.testCoveragePct !== undefined &&
    metrics.testCoveragePct < thresholds.coverage
  ) {
    failures.push({
      kind: 'coverage',
      reason: `Coverage ${metrics.testCoveragePct}% is below required ${thresholds.coverage}%.`,
      actionableError: 'Increase test coverage or lower the configured coverage threshold.',
    });
  }

  if (
    thresholds.typeCoverage !== undefined &&
    metrics.typeCoveragePct !== undefined &&
    metrics.typeCoveragePct < thresholds.typeCoverage
  ) {
    failures.push({
      kind: 'typecheck',
      reason: `Type coverage ${metrics.typeCoveragePct}% is below required ${thresholds.typeCoverage}%.`,
      actionableError: 'Improve type coverage or lower the configured type coverage threshold.',
    });
  }

  if (
    thresholds.mcpScore !== undefined &&
    metrics.mcpScore !== undefined &&
    metrics.mcpScore < thresholds.mcpScore
  ) {
    failures.push({
      kind: 'mcp',
      reason: `MCP score ${metrics.mcpScore} is below required ${thresholds.mcpScore}.`,
      actionableError: 'Improve MCP evidence quality before committing.',
    });
  }

  if ((metrics.uncertainTags ?? 0) > 0) {
    failures.push({
      kind: 'uncertain',
      reason: `${metrics.uncertainTags} uncertain tag(s) remain.`,
      actionableError: 'Resolve or explicitly document uncertain tags before committing.',
    });
  }

  return failures;
}

function computeQualityScore(failures: QualityGateFailure[]): number {
  return Math.max(0, 100 - failures.length * 20);
}

interface BuildQualityResultInput {
  kind: QualityCheckKind;
  enabled: boolean;
  command: string;
  args: string[];
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  timeoutSeconds?: number;
}

function buildQualityResult(input: BuildQualityResultInput): QualityCheckResult {
  const output = [input.stdout, input.stderr].filter(Boolean).join('\n');
  const success = input.exitCode === 0 && !input.timedOut;
  const status: QualityCheckStatus = input.timedOut
    ? 'timed_out'
    : success
      ? 'passed'
      : 'failed';
  const parsed = parseQualityOutput(input.kind, output);
  const summary = input.timedOut
    ? `${input.kind} check timed out after ${input.timeoutSeconds}s.`
    : firstUsefulLine(output) ?? (success ? `${input.kind} check passed.` : `${input.kind} check failed.`);
  const actionableError = success
    ? undefined
    : actionableErrorFor(input.kind, status, input.timeoutSeconds);

  return {
    kind: input.kind,
    enabled: input.enabled,
    success,
    status,
    command: input.command,
    args: input.args,
    exitCode: input.exitCode,
    stdout: input.stdout,
    stderr: input.stderr,
    summary,
    actionableError,
    ...parsed,
  };
}

function parseQualityOutput(
  kind: QualityCheckKind,
  output: string,
): Pick<QualityCheckResult, 'coverage' | 'vulnerabilities'> {
  if (kind === 'vulnerability') {
    return { vulnerabilities: parseVulnerabilityOutput(output) };
  }

  if (kind === 'coverage') {
    return { coverage: parseCoverageOutput(output) };
  }

  return {};
}

function actionableErrorFor(
  kind: QualityCheckKind,
  status: QualityCheckStatus,
  timeoutSeconds?: number,
): string {
  if (status === 'timed_out') {
    return `${kind} check timed out after ${timeoutSeconds}s. Increase timeoutSeconds or optimize the command.`;
  }

  switch (kind) {
    case 'vulnerability':
      return 'Review dependency advisories and update, patch, or explicitly disable the vulnerability check.';
    case 'coverage':
      return 'Improve test coverage or adjust the configured coverage threshold.';
    case 'lint':
      return 'Fix lint issues or update the lint configuration.';
    case 'typecheck':
      return 'Fix TypeScript errors or update the typecheck command.';
    case 'secrets':
      return 'Remove detected secrets or replace them with environment variable placeholders.';
    case 'uncertain':
      return 'Resolve uncertain tags before committing.';
    case 'mcp':
      return 'Improve MCP score evidence before committing.';
  }
}

function parseJsonObject(output: string): Record<string, any> | undefined {
  try {
    const parsed = JSON.parse(output);
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function numberFrom(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null;
}

function coverageKey(label: string): keyof CoverageSummary {
  switch (label.toLowerCase()) {
    case 'statements':
      return 'statements';
    case 'branches':
      return 'branches';
    case 'functions':
      return 'functions';
    default:
      return 'lines';
  }
}

function firstUsefulLine(output: string): string | undefined {
  return output
    .split(/\r?\n/)
    .map(line => line.trim())
    .find(Boolean);
}
