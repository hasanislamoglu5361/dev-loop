import { describe, expect, it, vi } from 'vitest';
import { createCli } from '../cli.js';

describe('FEATURE121 voice CLI contract', () => {
  it('requires explicit confirmation before using transcript text', async () => {
    const command = vi.fn(async () => ({ processed: true }));
    const cli = createCli({ dataApi: { command } });
    await expect(cli.parseAsync(['node', 'dev-loop', 'voice', 'run tests'])).rejects.toThrow('--yes');
    expect(command).not.toHaveBeenCalled();
  });

  it('passes explicitly confirmed transcripts to the voice workflow', async () => {
    const command = vi.fn(async () => ({ processed: true }));
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const cli = createCli({ dataApi: { command } });
    await cli.parseAsync(['node', 'dev-loop', 'voice', 'run tests', '--yes', '--project-dir', '/project']);
    expect(command).toHaveBeenCalledWith('voice', { text: 'run tests', projectDir: '/project' });
    log.mockRestore();
  });
});
