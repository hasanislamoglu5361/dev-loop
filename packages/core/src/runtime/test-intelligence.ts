import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ProcessError, runProcess } from '../utils/process.js';
import type { SpawnLike } from '../utils/process.js';

export type IntelligenceStatus = 'passed' | 'failed' | 'skipped' | 'unsupported';

export interface FlakyObservation {
  testName: string;
  passCount: number;
  failCount: number;
}

export interface FlakyAssessment extends FlakyObservation {
  sampleCount: number;
  failureRate: number;
  flaky: boolean;
}

export interface MutationConfig {
  enabled: boolean;
  command?: string;
  args?: string[];
  timeoutSeconds?: number;
}

export interface GoldenFileExpectation {
  file: string;
  sha256: string;
}

export interface TestIntelligenceRequest {
  projectDir: string;
  changedFiles?: string[];
  testFiles?: string[];
  flaky?: { observations: FlakyObservation[]; minimumSamples?: number; failureRateThreshold?: number };
  mutation?: MutationConfig;
  goldenFiles?: GoldenFileExpectation[];
  spawn?: SpawnLike;
  env?: NodeJS.ProcessEnv;
}

export interface TestIntelligenceResult {
  relatedTests: string[];
  flaky: { status: IntelligenceStatus; assessments: FlakyAssessment[]; summary: string };
  mutation: { status: IntelligenceStatus; summary: string; exitCode: number | null };
  golden: { status: IntelligenceStatus; summary: string; mismatches: string[] };
}

/** Put tests sharing a basename/path segment with changed files first, stably. */
export function orderRelatedTests(changedFiles: string[], testFiles: string[]): string[] {
  const tokens = new Set(changedFiles.flatMap(file => path.basename(file).replace(/\.[^.]+$/, '').split(/[-_.]/)).filter(token => token.length > 1));
  return testFiles.map((file, index) => ({
    file,
    index,
    score: path.basename(file).replace(/\.[^.]+$/, '').split(/[-_.]/).filter(token => tokens.has(token)).length,
  })).sort((a, b) => b.score - a.score || a.index - b.index).map(item => item.file);
}

export function assessFlakyTests(
  observations: FlakyObservation[],
  minimumSamples = 5,
  failureRateThreshold = 0.1,
): FlakyAssessment[] {
  if (minimumSamples < 1) throw new Error('minimumSamples must be at least 1.');
  if (failureRateThreshold < 0 || failureRateThreshold > 1) throw new Error('failureRateThreshold must be between 0 and 1.');
  return observations.map(observation => {
    const sampleCount = observation.passCount + observation.failCount;
    const failureRate = sampleCount === 0 ? 0 : observation.failCount / sampleCount;
    return { ...observation, sampleCount, failureRate, flaky: sampleCount >= minimumSamples && failureRate > failureRateThreshold && failureRate < 1 };
  });
}

export async function runTestIntelligence(request: TestIntelligenceRequest): Promise<TestIntelligenceResult> {
  const relatedTests = orderRelatedTests(request.changedFiles ?? [], request.testFiles ?? []);
  const assessments = request.flaky
    ? assessFlakyTests(request.flaky.observations, request.flaky.minimumSamples, request.flaky.failureRateThreshold)
    : [];
  const flakyTests = assessments.filter(item => item.flaky);

  return {
    relatedTests,
    flaky: {
      status: request.flaky ? (flakyTests.length ? 'failed' : 'passed') : 'skipped',
      assessments,
      summary: request.flaky ? `${flakyTests.length} flaky test(s) exceed the configured threshold.` : 'Flaky-test tracking is not configured.',
    },
    mutation: await runMutation(request),
    golden: await verifyGoldenFiles(request.projectDir, request.goldenFiles),
  };
}

async function runMutation(request: TestIntelligenceRequest): Promise<TestIntelligenceResult['mutation']> {
  const config = request.mutation;
  if (!config?.enabled) return { status: 'skipped', summary: 'Mutation testing is disabled.', exitCode: null };
  if (!config.command) return { status: 'unsupported', summary: 'Mutation testing is enabled but no command is configured.', exitCode: null };
  try {
    const result = await runProcess(config.command, config.args ?? [], {
      cwd: request.projectDir,
      env: request.env,
      spawn: request.spawn,
      timeoutMs: config.timeoutSeconds === undefined ? undefined : config.timeoutSeconds * 1000,
    });
    return { status: 'passed', summary: firstLine(result.stdout) ?? 'Mutation tests passed.', exitCode: result.exitCode };
  } catch (error) {
    if (!(error instanceof ProcessError)) throw error;
    return { status: 'failed', summary: firstLine(error.stderr) ?? 'Mutation tests failed.', exitCode: error.exitCode };
  }
}

async function verifyGoldenFiles(projectDir: string, files?: GoldenFileExpectation[]): Promise<TestIntelligenceResult['golden']> {
  if (!files) return { status: 'skipped', summary: 'Golden-file verification is not configured.', mismatches: [] };
  const mismatches: string[] = [];
  for (const expected of files) {
    try {
      const content = await readFile(path.resolve(projectDir, expected.file));
      const actual = createHash('sha256').update(content).digest('hex');
      if (actual !== expected.sha256) mismatches.push(expected.file);
    } catch {
      mismatches.push(expected.file);
    }
  }
  return {
    status: mismatches.length ? 'failed' : 'passed',
    summary: mismatches.length ? `${mismatches.length} golden file(s) changed or are missing.` : `${files.length} golden file(s) verified.`,
    mismatches,
  };
}

function firstLine(value: string): string | undefined {
  return value.split(/\r?\n/).map(line => line.trim()).find(Boolean);
}
