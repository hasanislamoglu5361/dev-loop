import { describe, expect, it } from 'vitest';
import { parseVerifierOutput } from '../../models/verifier/parser.js';

describe('FEATURE052 - Verifier JSON Output Parser', () => {
  it('parses valid verifier JSON and preserves confidence and uncertain fields', () => {
    const parsed = parseVerifierOutput('```json\n{"bugs":[{"severity":"high","message":"Broken edge case","file":"src/a.ts","line":3}],"confidence":0.9,"mcp_score":{"score":80,"maxScore":100},"uncertain_fields":["runtime"]}\n```');

    expect(parsed).toMatchObject({
      status: 'fail',
      confidenceScore: 0.9,
      findings: [{ severity: 'error', message: 'Broken edge case', file: 'src/a.ts', line: 3 }],
      mcpScore: { score: 80, maxScore: 100, normalized: 0.8 },
      metadata: { uncertainFields: ['runtime'] },
    });
  });

  it('extracts JSON when text appears before and after the fenced block', () => {
    const parsed = parseVerifierOutput('Notes first\n```json\n{"bugs":[],"confidence":0.7,"mcp_score":95}\n```\nMore commentary');

    expect(parsed).toMatchObject({
      status: 'pass',
      confidenceScore: 0.7,
      mcpScore: { score: 95, maxScore: 100, normalized: 0.95 },
    });
  });

  it('skips malformed JSON blocks and uses the first valid fenced JSON block', () => {
    const parsed = parseVerifierOutput('```json\n{"bugs":[}\n```\nnoise\n```json\n{"bugs":[{"severity":"medium","message":"Second block"}],"confidence":0.4}\n```');

    expect(parsed).toMatchObject({
      status: 'needs-changes',
      confidenceScore: 0.4,
      findings: [{ severity: 'warning', message: 'Second block' }],
    });
  });

  it('falls back to a medium-severity bug when no JSON is present', () => {
    const parsed = parseVerifierOutput('I could not produce JSON, but something seems wrong.');

    expect(parsed).toMatchObject({
      status: 'needs-changes',
      findings: [{ severity: 'warning', message: expect.stringContaining('valid JSON') }],
      metadata: { rawSeverity: 'medium' },
    });
  });

  it('does not trust invalid severity strings', () => {
    const parsed = parseVerifierOutput('```json\n{"bugs":[{"severity":"catastrophic","message":"bad severity"}]}\n```');

    expect(parsed).toMatchObject({
      status: 'needs-changes',
      findings: [{ severity: 'warning', message: expect.stringContaining('valid JSON') }],
    });
  });
});
