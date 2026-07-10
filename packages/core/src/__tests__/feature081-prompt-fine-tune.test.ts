import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  exportFineTuneJsonl,
  getActivePromptVersion,
  recordPromptSample,
  retirePromptVersion,
} from '../context/prompt-evolution.js';
import type { PromptVersionRecord } from '../context/prompt-evolution.js';

describe('FEATURE081 - Prompt AB Testing and Fine Tune Export', () => {
  let tempDir: string | undefined;

  afterEach(() => {
    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  it('Test active prompt selection', () => {
    const versions: PromptVersionRecord[] = [
      { id: 'v1', name: 'old', content: 'old prompt', active: false, sampleCount: 10, successCount: 5, successRate: 0.5 },
      { id: 'v2', name: 'candidate', content: 'new prompt', active: true, sampleCount: 4, successCount: 3, successRate: 0.75 },
    ];

    expect(getActivePromptVersion(versions)).toEqual(expect.objectContaining({
      id: 'v2',
      content: 'new prompt',
    }));
  });

  it('Test retiring prompt', () => {
    const versions: PromptVersionRecord[] = [
      { id: 'v1', name: 'old', content: 'old prompt', active: true, sampleCount: 1, successCount: 1, successRate: 1 },
    ];

    const retired = retirePromptVersion(versions, 'v1');

    expect(retired).toEqual([
      expect.objectContaining({ id: 'v1', active: false, retiredAt: expect.any(String) }),
    ]);
    expect(getActivePromptVersion(retired)).toBeUndefined();
  });

  it('tracks sample count and success rate', () => {
    const versions: PromptVersionRecord[] = [
      { id: 'v1', name: 'base', content: 'prompt', active: true, sampleCount: 1, successCount: 1, successRate: 1 },
    ];

    const updated = recordPromptSample(versions, { promptId: 'v1', success: false });

    expect(updated).toEqual([
      expect.objectContaining({
        id: 'v1',
        sampleCount: 2,
        successCount: 1,
        successRate: 0.5,
      }),
    ]);
  });

  it('Test valid JSONL lines', async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dev-loop-finetune-'));
    const outputPath = path.join(tempDir, 'dataset.jsonl');

    const result = await exportFineTuneJsonl({
      enabled: true,
      outputPath,
      records: [
        {
          loopId: 'loop-1',
          success: true,
          messages: [
            { role: 'system', content: 'Use token sk-abcdefghijklmnopqrstuvwxyz123456 safely.' },
            { role: 'assistant', content: 'Done.' },
          ],
        },
        {
          loopId: 'loop-2',
          success: false,
          messages: [{ role: 'assistant', content: 'Malformed failure' }],
        },
      ],
    });

    expect(result).toEqual({ exported: 1, skipped: 1, outputPath });
    const lines = fs.readFileSync(outputPath, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]);
    expect(parsed).toEqual({
      messages: [
        { role: 'system', content: 'Use token [REDACTED] safely.' },
        { role: 'assistant', content: 'Done.' },
      ],
      metadata: { loopId: 'loop-1' },
    });
  });

  it('redacts secret shapes beyond sk- tokens (GitHub PAT, Slack webhook, Bearer header)', async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dev-loop-finetune-'));
    const outputPath = path.join(tempDir, 'dataset.jsonl');

    const result = await exportFineTuneJsonl({
      enabled: true,
      outputPath,
      records: [
        {
          loopId: 'loop-1',
          success: true,
          messages: [
            { role: 'system', content: 'Push using ghp_1234567890abcdefghijklmnopqrstuvwxyz' },
            {
              role: 'user',
              content: 'Webhook delivery failed: https://hooks.slack.com/services/T000/B000/XXXXXXXXXXXXXXXXXXXXXXXX',
            },
            { role: 'assistant', content: 'Sent with Authorization: Bearer abcdefghijklmnopqrstuvwxyz' },
          ],
        },
      ],
    });

    expect(result).toEqual({ exported: 1, skipped: 0, outputPath });
    const raw = fs.readFileSync(outputPath, 'utf8');

    expect(raw).not.toContain('ghp_1234567890abcdefghijklmnopqrstuvwxyz');
    expect(raw).not.toContain('https://hooks.slack.com/services/T000/B000/XXXXXXXXXXXXXXXXXXXXXXXX');
    expect(raw).not.toContain('Bearer abcdefghijklmnopqrstuvwxyz');

    const parsed = JSON.parse(raw.trim());
    expect(parsed.messages[0].content).toBe('Push using [REDACTED]');
    expect(parsed.messages[1].content).toBe('Webhook delivery failed: [REDACTED]');
    expect(parsed.messages[2].content).toBe('Sent with Authorization: [REDACTED]');
  });
});
