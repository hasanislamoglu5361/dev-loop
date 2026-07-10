import { describe, expect, it } from 'vitest';

describe('FEATURE039 - utility barrel exports', () => {
  it('exports stable utility helpers from the utils barrel', async () => {
    const utils = await import('../utils/index.js');

    expect(utils).toEqual(expect.objectContaining({
      calculateCallCost: expect.any(Function),
      countTokens: expect.any(Function),
      ensureDir: expect.any(Function),
      globFiles: expect.any(Function),
      parseGeneratedFiles: expect.any(Function),
      resolveProjectPath: expect.any(Function),
      retryWithBackoff: expect.any(Function),
      runProcess: expect.any(Function),
      redactSecrets: expect.any(Function),
      safeJsonStringify: expect.any(Function),
      withTimeout: expect.any(Function),
    }));
  });

  it('does not export internal constants from the utils barrel', async () => {
    const utils = await import('../utils/index.js');

    expect('GENERATED_FOLDER_IGNORES' in utils).toBe(false);
    expect('SECRET_VALUE_PATTERNS' in utils).toBe(false);
  });
});
