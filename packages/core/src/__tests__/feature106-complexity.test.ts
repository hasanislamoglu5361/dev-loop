import { describe, expect, it } from 'vitest';
import { measureCyclomaticComplexity } from '../runtime/complexity.js';

describe('FEATURE106 - complexity measurement', () => {
  it('counts control-flow branches but ignores comments and strings', () => {
    expect(measureCyclomaticComplexity(`
      // if while &&
      const text = "if (fake)";
      if (a && b) { for (const item of items) use(item); }
    `)).toBe(4);
  });
});
