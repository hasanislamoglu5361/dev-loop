import { describe, expect, it } from 'vitest';
import { scoreMcpUsage } from '../models/verifier/mcp-scorer.js';

describe('FEATURE074 - MCP Usage Scorer', () => {
  it('Test no MCP needed', () => {
    const result = scoreMcpUsage({
      task: 'Refactor the local token counter helper and run unit tests.',
      usage: [],
    });

    expect(result).toMatchObject({
      score: 100,
      shouldHaveUsed: [],
      incorrectUse: [],
      webSearch: { count: 0, success: 0 },
    });
    expect(result.notes).toContain('No MCP usage required for this task.');
  });

  it('Test missed web search', () => {
    const result = scoreMcpUsage({
      task: 'Check the latest OpenAI API documentation before updating this integration.',
      usage: [],
    });

    expect(result.score).toBeLessThan(100);
    expect(result.shouldHaveUsed).toEqual(['web.search']);
    expect(result.notes).toContain('Should have used web.search for current external information.');
    expect(result.webSearch).toEqual({ count: 0, success: 0 });
  });

  it('Test failed unnecessary tool', () => {
    const result = scoreMcpUsage({
      task: 'Rename a local variable in the parser.',
      usage: [
        { server: 'browser', tool: 'web.search', success: false, error: 'network unavailable' },
      ],
    });

    expect(result.score).toBeLessThan(100);
    expect(result.incorrectUse).toEqual([
      expect.objectContaining({
        tool: 'web.search',
        reason: 'Tool was not needed for this task and failed.',
      }),
    ]);
    expect(result.webSearch).toEqual({ count: 1, success: 0 });
  });

  it('scores correct web search use and keeps score in range', () => {
    const result = scoreMcpUsage({
      task: 'Find the current package documentation before changing the connector.',
      usage: [
        { server: 'web', tool: 'web.search', success: true },
      ],
    });

    expect(result).toMatchObject({
      score: 100,
      shouldHaveUsed: [],
      incorrectUse: [],
      webSearch: { count: 1, success: 1 },
    });
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });
});
