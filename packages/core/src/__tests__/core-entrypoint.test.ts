import { describe, expect, it } from 'vitest';

describe('@dev-loop/core public API', () => {
  it('exports a stable entry point', async () => {
    const core = await import('../index.js');

    expect(core).toBeTruthy();
    expect(core.ConfigSchema).toBeTruthy();
    expect(core.loadConfig).toBeTruthy();
  });
});
