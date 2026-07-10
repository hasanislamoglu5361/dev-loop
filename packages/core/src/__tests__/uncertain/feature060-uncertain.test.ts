import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { detectUncertainInFiles, detectUncertainInPath } from '../../models/verifier/uncertain.js';

describe('FEATURE060 - TODO UNCERTAIN Detection', () => {
  it('detects TODO:UNCERTAIN in multiple language comment styles', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dev-loop-uncertain-'));
    const file = path.join(dir, 'mixed.md');
    await fs.writeFile(file, [
      '// TODO:UNCERTAIN JS note',
      '# TODO:UNCERTAIN Python shell yaml note',
      '-- TODO:UNCERTAIN SQL note',
      '/* TODO:UNCERTAIN C-like note */',
      '<!-- TODO:UNCERTAIN Markdown note -->',
    ].join('\n'));

    const results = await detectUncertainInFiles([file]);

    expect(results).toHaveLength(5);
    expect(results[0]).toMatchObject({ file, line: 1, note: 'JS note' });
    expect(results[4]).toMatchObject({ line: 5, note: 'Markdown note -->' });
  });

  it('detects in directories while skipping ignored directories', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dev-loop-uncertain-'));
    await fs.mkdir(path.join(dir, 'src'));
    await fs.mkdir(path.join(dir, 'node_modules'));
    await fs.writeFile(path.join(dir, 'src', 'a.ts'), '// TODO:UNCERTAIN keep');
    await fs.writeFile(path.join(dir, 'node_modules', 'ignored.ts'), '// TODO:UNCERTAIN ignore');

    const results = await detectUncertainInPath(dir);

    expect(results).toEqual([
      expect.objectContaining({ file: path.join(dir, 'src', 'a.ts'), line: 1, note: 'keep' }),
    ]);
  });

  it('does not leak regex state across files and detects multiple tags', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dev-loop-uncertain-'));
    const first = path.join(dir, 'first.ts');
    const second = path.join(dir, 'second.ts');
    await fs.writeFile(first, '// TODO:UNCERTAIN first\n// TODO:UNCERTAIN second');
    await fs.writeFile(second, '// TODO:UNCERTAIN third');

    const results = await detectUncertainInFiles([first, second]);

    expect(results.map(result => result.note)).toEqual(['first', 'second', 'third']);
  });

  it('supports a custom configured tag', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dev-loop-uncertain-'));
    const file = path.join(dir, 'a.ts');
    await fs.writeFile(file, '// REVIEW:UNSURE custom note');

    await expect(detectUncertainInFiles([file], { tag: 'REVIEW:UNSURE' })).resolves.toEqual([
      expect.objectContaining({ note: 'custom note' }),
    ]);
  });
});
