import { afterEach, describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { closeDatabase, initDatabase } from '../db/connection.js';
import {
  createLoop,
  getMcpErrors,
  getMcpScores,
  getMcpUsage,
  getQualityHistory,
  getUncertainTags,
  getUnresolvedUncertainTags,
  resolveUncertainTag,
  saveMcpError,
  saveMcpScore,
  saveMcpUsage,
  saveQualityHistory,
  saveUncertainTags,
} from '../db/queries.js';

function createTempDatabaseForTest(): string {
  return path.join(os.tmpdir(), `dev-loop-feature029-${crypto.randomUUID()}.db`);
}

afterEach(() => {
  closeDatabase();
});

describe('FEATURE029 - MCP, uncertain, and quality queries', () => {
  it('saves and reads MCP usage, errors, and score JSON fields', async () => {
    initDatabase(createTempDatabaseForTest());

    const loop = await createLoop('feature-mcp', { primaryModel: 'qwen' });
    const usage = await saveMcpUsage({
      loopId: loop.id,
      turnId: 0,
      model: 'qwen',
      mcpServer: 'filesystem',
      toolName: 'read_file',
      inputSummary: 'read package manifest',
      outputSummary: 'manifest json',
      success: false,
      wasNecessary: false,
      couldHavePreventedError: false,
      durationMs: 0,
    });
    await saveMcpError({
      loopId: loop.id,
      turnId: 0,
      model: 'qwen',
      mcpServer: 'filesystem',
      toolName: 'read_file',
      errorType: 'permission',
      errorMessage: 'denied',
      inputSummary: 'read package manifest',
    });
    await saveMcpScore(loop.id, {
      model: 'qwen',
      shouldHaveUsed: [],
      correctlyUsed: ['filesystem'],
      incorrectlyUsed: [],
      webSearchCount: 0,
      webSearchSuccess: 0,
      score: 0,
      verifierNotes: 'MCP score kept empty arrays',
    });

    await expect(getMcpUsage({ loopId: loop.id })).resolves.toEqual([
      expect.objectContaining({
        id: usage.id,
        loop_id: loop.id,
        turn_id: 0,
        success: 0,
        was_necessary: 0,
        could_have_prevented_error: 0,
        duration_ms: 0,
      }),
    ]);
    await expect(getMcpErrors({ loopId: loop.id })).resolves.toEqual([
      expect.objectContaining({
        loop_id: loop.id,
        turn_id: 0,
        error_type: 'permission',
        error_message: 'denied',
      }),
    ]);
    await expect(getMcpScores({ loopId: loop.id })).resolves.toEqual([
      expect.objectContaining({
        loop_id: loop.id,
        should_have_used: '[]',
        correctly_used: '["filesystem"]',
        incorrectly_used: '[]',
        web_search_count: 0,
        web_search_success: 0,
        score: 0,
      }),
    ]);
  });

  it('supports unresolved to resolved uncertain tag flow', async () => {
    initDatabase(createTempDatabaseForTest());

    const loop = await createLoop('feature-uncertain');
    await saveUncertainTags(loop.id, [
      { file: 'src/a.ts', line: 0, snippet: '', note: '' },
      { file: 'src/b.ts', line: 10, note: 'needs verifier' },
    ]);

    const unresolved = await getUnresolvedUncertainTags(loop.id);
    expect(unresolved).toHaveLength(2);
    expect(unresolved[0]).toMatchObject({
      file_path: 'src/a.ts',
      line_number: 0,
      code_snippet: '',
      model_note: '',
      resolved: 0,
    });

    await resolveUncertainTag(Number(unresolved[0].id), 'accepted risk');

    await expect(getUnresolvedUncertainTags(loop.id)).resolves.toEqual([
      expect.objectContaining({ file_path: 'src/b.ts', resolved: 0 }),
    ]);
    await expect(getUncertainTags({ loopId: loop.id })).resolves.toEqual([
      expect.objectContaining({
        id: unresolved[0].id,
        resolved: 1,
        resolution_note: 'accepted risk',
      }),
      expect.objectContaining({ file_path: 'src/b.ts', resolved: 0 }),
    ]);
  });

  it('saves and reads quality history for verifier and UI consumers', async () => {
    initDatabase(createTempDatabaseForTest());

    const loop = await createLoop('feature-quality');
    await saveQualityHistory(loop.id, {
      testCoveragePct: 0,
      complexityScore: 0,
      typeCoveragePct: 0,
      mutationScore: 0,
      secretsFound: 0,
      vulnerabilitiesCritical: 0,
      vulnerabilitiesHigh: 0,
      deadCodeCount: 0,
      duplicateCodePct: 0,
      techDebtMinutes: 0,
      lintErrors: 0,
      gatePassed: false,
    });

    await expect(getQualityHistory({ loopId: loop.id })).resolves.toEqual([
      expect.objectContaining({
        loop_id: loop.id,
        test_coverage_pct: 0,
        complexity_score: 0,
        type_coverage_pct: 0,
        mutation_score: 0,
        secrets_found: 0,
        vulnerabilities_critical: 0,
        vulnerabilities_high: 0,
        dead_code_count: 0,
        duplicate_code_pct: 0,
        tech_debt_minutes: 0,
        lint_errors: 0,
        gate_passed: 0,
      }),
    ]);
  });
});
