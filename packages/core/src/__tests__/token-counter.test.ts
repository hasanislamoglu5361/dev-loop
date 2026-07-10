import { describe, expect, it } from 'vitest';
import * as core from '../index.js';
import {
  canFitInBudget,
  countChatTokens,
  countFileTokens,
  countFilesTokens,
  countTokens,
  countTokensHeuristic,
  truncateToTokenBudget,
} from '../utils/token-counter.js';

describe('token counter', () => {
  it('uses model-aware tokenizer when available and falls back safely', async () => {
    const count = await countTokens('hello world', { model: 'gpt-4o' });

    expect(count).toBeGreaterThan(0);
  });

  it('falls back when tokenizer cannot be loaded', async () => {
    const count = await countTokens('hello world', { model: 'unknown-local-model' });

    expect(count).toBeGreaterThan(0);
  });

  it('returns zero for empty strings', async () => {
    await expect(countTokens('', { model: 'gpt-4o' })).resolves.toBe(0);
  });

  it('counts plain text, code, chat messages, files, and file bundles with deterministic fallback', () => {
    expect(countTokensHeuristic('')).toBe(0);
    expect(countTokensHeuristic('abcd')).toBe(1);
    expect(countTokensHeuristic('hello world from dev loop')).toBeLessThan('hello world from dev loop'.length);
    expect(countFileTokens('export const ok = true;\n', 'typescript')).toBeGreaterThan(0);
    expect(countChatTokens([
      { role: 'system', content: 'Be concise.' },
      { role: 'user', content: 'Explain token counting.' },
    ], 'gpt')).toBeGreaterThan(countTokensHeuristic('Be concise.Explain token counting.'));

    const bundle = countFilesTokens([
      { path: 'src/index.ts', content: 'export const ok = true;\n' },
      { path: 'README.md', content: '# Title\n\nSome markdown content.' },
    ]);

    expect(bundle.totalTokens).toBe(
      bundle.perFile['src/index.ts'] + bundle.perFile['README.md'],
    );
  });

  it('checks budgets and truncates without counting every character as a token', () => {
    const text = 'one two three four five six seven eight nine ten';

    expect(canFitInBudget(text, 100)).toBe(true);
    expect(canFitInBudget(text, 1)).toBe(false);

    const result = truncateToTokenBudget(text, 3);
    expect(result.overflow).toBe(true);
    expect(result.tokensUsed).toBeLessThanOrEqual(3);
    expect(result.truncated.length).toBeGreaterThan(0);
    expect(result.truncated.length).toBeLessThan(text.length);
  });

  it('exports token utilities from the core public entrypoint', () => {
    expect(core).toEqual(expect.objectContaining({
      countTokens: expect.any(Function),
      countChatTokens: expect.any(Function),
      countFileTokens: expect.any(Function),
      countFilesTokens: expect.any(Function),
      canFitInBudget: expect.any(Function),
      truncateToTokenBudget: expect.any(Function),
    }));
  });
});
