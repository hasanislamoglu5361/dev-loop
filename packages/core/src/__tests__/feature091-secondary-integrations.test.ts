import { describe, expect, it, vi } from 'vitest';
import { runSecondaryIntegrations } from '../integrations/secondary.js';

describe('FEATURE091 - Secondary Integrations', () => {
  it('Test disabled integrations are no-op', async () => {
    const result = await runSecondaryIntegrations({
      linear: { enabled: false },
      notion: { enabled: false },
      postman: { enabled: false },
      obsidian: { enabled: false },
      calendar: { enabled: false },
      payload: {
        title: 'FEATURE091',
        summary: 'Safe success hook integration.',
      },
    });

    expect(result.results).toEqual([
      { integration: 'linear', status: 'skipped', reason: 'Integration disabled.' },
      { integration: 'notion', status: 'skipped', reason: 'Integration disabled.' },
      { integration: 'postman', status: 'skipped', reason: 'Integration disabled.' },
      { integration: 'obsidian', status: 'skipped', reason: 'Integration disabled.' },
      { integration: 'calendar', status: 'skipped', reason: 'Integration disabled.' },
    ]);
  });

  it('calls enabled secondary integrations through mocked clients', async () => {
    const linear = { createIssue: vi.fn(async () => ({ id: 'LIN-1' })) };
    const notion = { appendPage: vi.fn(async () => ({ id: 'notion-page' })) };
    const postman = { runSmokeTest: vi.fn(async () => ({ ok: true, runId: 'pm-1' })) };
    const obsidian = { syncNote: vi.fn(async () => ({ path: 'FEATURE091.md' })) };
    const calendar = { recordProgress: vi.fn(async () => ({ id: 'cal-1' })) };

    const result = await runSecondaryIntegrations({
      linear: { enabled: true, client: linear },
      notion: { enabled: true, client: notion },
      postman: { enabled: true, client: postman, collectionId: 'smoke' },
      obsidian: { enabled: true, client: obsidian, notePath: 'FEATURE091.md' },
      calendar: { enabled: true, client: calendar },
      payload: {
        title: 'FEATURE091',
        summary: 'Safe success hook integration.',
        progress: 80,
      },
    });

    expect(result.results).toEqual([
      { integration: 'linear', status: 'success', id: 'LIN-1' },
      { integration: 'notion', status: 'success', id: 'notion-page' },
      { integration: 'postman', status: 'success', id: 'pm-1' },
      { integration: 'obsidian', status: 'success', id: 'FEATURE091.md' },
      { integration: 'calendar', status: 'success', id: 'cal-1' },
    ]);
    expect(linear.createIssue).toHaveBeenCalledWith(expect.objectContaining({ title: 'FEATURE091' }));
    expect(notion.appendPage).toHaveBeenCalledWith(expect.objectContaining({ title: 'FEATURE091' }));
    expect(postman.runSmokeTest).toHaveBeenCalledWith('smoke');
    expect(obsidian.syncNote).toHaveBeenCalledWith(expect.objectContaining({ path: 'FEATURE091.md' }));
    expect(calendar.recordProgress).toHaveBeenCalledWith(expect.objectContaining({ progress: 80 }));
  });

  it('Test Postman smoke failure returns structured result', async () => {
    const postman = {
      runSmokeTest: vi.fn(async () => ({ ok: false, failures: ['GET /health returned 500'] })),
    };

    await expect(runSecondaryIntegrations({
      postman: { enabled: true, client: postman, collectionId: 'smoke' },
      payload: {
        title: 'FEATURE091',
        summary: 'Run smoke tests.',
      },
    })).resolves.toEqual({
      results: [
        {
          integration: 'postman',
          status: 'failed',
          error: 'Postman smoke test failed.',
          details: ['GET /health returned 500'],
        },
      ],
    });
  });
});
