import { describe, expect, it } from 'vitest';

describe('@dev-loop/core public API', () => {
  it('exports a stable entry point', async () => {
    const core = await import('../index.js');

    expect(core).toEqual(expect.objectContaining({
      loadConfig: expect.any(Function),
      saveConfig: expect.any(Function),
      createDefaultConfig: expect.any(Function),
      EventBus: expect.any(Function),
      DevLoopError: expect.any(Function),
      countTokens: expect.any(Function),
    }));
  });

  it('does not expose raw database internals from the root API', async () => {
    const core = await import('../index.js');

    expect('loopHistory' in core).toBe(false);
    expect('rawQuery' in core).toBe(false);
  });

  it('exposes intended database APIs through the db subpath module', async () => {
    const db = await import('../db/index.js');

    expect(db).toEqual(expect.objectContaining({
      initDatabase: expect.any(Function),
      runMigrations: expect.any(Function),
      createLoop: expect.any(Function),
      getLoopDetail: expect.any(Function),
    }));
  });
});
