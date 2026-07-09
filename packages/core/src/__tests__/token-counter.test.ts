import { describe, expect, it } from 'vitest';
import { countTokens } from '../utils/token-counter.js';

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
});
