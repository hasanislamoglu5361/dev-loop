import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import * as core from '../index.js';
import {
  ensureDir,
  moveFileAtomic,
  pathExists,
  readFileSafe,
  writeFileAtomic,
} from '../utils/file-system.js';

async function tempProjectDir(): Promise<string> {
  return fsPromises.mkdtemp(path.join(os.tmpdir(), 'dev-loop-fs-'));
}

describe('FEATURE033 - atomic file system helpers', () => {
  it('writes and reads files while creating parent directories', async () => {
    const projectDir = await tempProjectDir();
    const filePath = path.join(projectDir, 'nested', 'dir', 'file.txt');

    await expect(pathExists(filePath)).resolves.toBe(false);
    await writeFileAtomic(filePath, 'hello');

    await expect(pathExists(filePath)).resolves.toBe(true);
    await expect(readFileSafe(filePath)).resolves.toBe('hello');
    await ensureDir(path.join(projectDir, 'another', 'dir'));
    await expect(pathExists(path.join(projectDir, 'another', 'dir'))).resolves.toBe(true);
    await expect(readFileSafe(path.join(projectDir, 'missing.txt'))).resolves.toBe('');
  });

  it('cleans up temp files after a failed atomic write', async () => {
    const projectDir = await tempProjectDir();
    const filePath = path.join(projectDir, 'file.txt');
    const tempPath = path.join(projectDir, `.file.txt.tmp-${process.pid}`);

    await expect(writeFileAtomic(filePath, 'hello', {
      renameSync: () => {
        throw Object.assign(new Error('rename failed'), { code: 'EACCES' });
      },
      writeFileSync: fs.writeFileSync,
      unlinkSync: fs.unlinkSync,
    })).rejects.toThrow('rename failed');
    await expect(pathExists(tempPath)).resolves.toBe(false);
    await expect(pathExists(filePath)).resolves.toBe(false);
  });

  it('falls back to copy and delete only for cross-filesystem move failures', async () => {
    const projectDir = await tempProjectDir();
    const srcPath = path.join(projectDir, 'src.txt');
    const destPath = path.join(projectDir, 'dest', 'dest.txt');
    await fsPromises.writeFile(srcPath, 'moved');

    await moveFileAtomic(srcPath, destPath, {
      renameSync: () => {
        throw Object.assign(new Error('cross-device'), { code: 'EXDEV' });
      },
    });

    await expect(pathExists(srcPath)).resolves.toBe(false);
    await expect(readFileSafe(destPath)).resolves.toBe('moved');
  });

  it('does not swallow unexpected move errors', async () => {
    const projectDir = await tempProjectDir();
    const srcPath = path.join(projectDir, 'src.txt');
    const destPath = path.join(projectDir, 'dest.txt');
    await fsPromises.writeFile(srcPath, 'blocked');

    await expect(moveFileAtomic(srcPath, destPath, {
      renameSync: () => {
        throw Object.assign(new Error('permission denied'), { code: 'EACCES' });
      },
    })).rejects.toThrow('permission denied');
    await expect(readFileSafe(srcPath)).resolves.toBe('blocked');
    await expect(pathExists(destPath)).resolves.toBe(false);
  });

  it('exports file system helpers from the core public entrypoint', () => {
    expect(core).toEqual(expect.objectContaining({
      writeFileAtomic: expect.any(Function),
      readFileSafe: expect.any(Function),
      ensureDir: expect.any(Function),
      pathExists: expect.any(Function),
      moveFileAtomic: expect.any(Function),
    }));
  });
});
