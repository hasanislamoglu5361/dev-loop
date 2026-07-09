import { describe, expect, it } from 'vitest';
import * as schema from '../db/schema.js';
import { loopHistory } from '../db/schema.js';

describe('database schema', () => {
  it('exports real Drizzle table definitions', () => {
    expect(loopHistory).toBeTruthy();
    expect(loopHistory.$inferSelect).toBeUndefined();
  });

  it('exports all required table definitions', () => {
    expect(schema.loopHistory).toBeTruthy();
    expect(schema.loopTurns).toBeTruthy();
    expect(schema.errorPatterns).toBeTruthy();
    expect(schema.successPatterns).toBeTruthy();
    expect(schema.modelProfiles).toBeTruthy();
    expect(schema.mcpUsage).toBeTruthy();
    expect(schema.mcpErrors).toBeTruthy();
    expect(schema.mcpScores).toBeTruthy();
    expect(schema.benchmarkResults).toBeTruthy();
    expect(schema.qualityHistory).toBeTruthy();
    expect(schema.uncertainTags).toBeTruthy();
    expect(schema.promptVersions).toBeTruthy();
    expect(schema.notificationLog).toBeTruthy();
    expect(schema.tickets).toBeTruthy();
    expect(schema.auditLog).toBeTruthy();
    expect(schema.planningHistory).toBeTruthy();
    expect(schema.dbQueryAnalysis).toBeTruthy();
    expect(schema.userRatings).toBeTruthy();
    expect(schema.flakyTests).toBeTruthy();
    expect(schema.goldenFiles).toBeTruthy();
    expect(schema.agentCommunication).toBeTruthy();
    expect('modelPricing' in schema).toBe(false);
  });
});
