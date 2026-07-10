import { describe, expect, it } from 'vitest';
import { buildDiffAwareRetryPrompt } from '../../models/prompts/diff-prompt.js';

describe('FEATURE059 - Diff-Aware Prompt Builder', () => {
  it('builds a focused retry prompt for turn greater than one', () => {
    const prompt = buildDiffAwareRetryPrompt({
      featureId: 'FEATURE059',
      turn: 2,
      originalPrompt: 'Implement the feature.',
      previousDiff: 'diff --git a/src/a.ts b/src/a.ts',
      semanticAnalysis: { riskLevel: 'medium', summary: 'return/throw/control-flow change', riskScore: 55 },
      remainingBugs: [{ file: 'src/a.ts', line: 12, message: 'Fix guard', severity: 'error' }],
      uncertainTags: ['runtime edge'],
    });

    expect(prompt).toContain('Retry turn 2');
    expect(prompt).toContain('diff --git');
    expect(prompt).toContain('return/throw/control-flow change');
    expect(prompt).toContain('src/a.ts:12');
    expect(prompt).toContain('Fix only the listed issues');
    expect(prompt).toContain('TODO:UNCERTAIN');
    expect(prompt).toContain('```json');
    expect(prompt).not.toContain('Rewrite everything');
  });

  it('builds a no-bugs prompt without asking for broad rewrites', () => {
    const prompt = buildDiffAwareRetryPrompt({
      featureId: 'FEATURE059',
      turn: 3,
      originalPrompt: 'Implement the feature.',
      previousDiff: '',
      semanticAnalysis: { riskLevel: 'low', summary: 'formatting-only change', riskScore: 10 },
      remainingBugs: [],
    });

    expect(prompt).toContain('No remaining verifier bugs were provided.');
    expect(prompt).toContain('Make the smallest necessary follow-up change');
    expect(prompt).not.toContain('full source');
  });

  it('includes the exact uncertain tag instruction', () => {
    const prompt = buildDiffAwareRetryPrompt({
      featureId: 'FEATURE059',
      turn: 2,
      originalPrompt: 'Implement the feature.',
      previousDiff: 'diff',
      semanticAnalysis: { riskLevel: 'medium', summary: 'behavior change', riskScore: 50 },
      remainingBugs: [{ message: 'unclear behavior', severity: 'warning' }],
      uncertainTags: ['unknown config'],
    });

    expect(prompt).toContain('If you cannot prove a claim, write TODO:UNCERTAIN with the reason.');
  });
});
