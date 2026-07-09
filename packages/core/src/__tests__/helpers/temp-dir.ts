import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function createTempProject(prefix = 'dev-loop-test-'): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

export function cleanupTempProject(dir: string): void {
  const realDir = fs.realpathSync.native(dir);
  const realTmp = fs.realpathSync.native(os.tmpdir());
  if (!realDir.startsWith(realTmp + path.sep)) {
    throw new Error(`Refusing to remove non-temp directory: ${dir}`);
  }
  fs.rmSync(dir, { recursive: true, force: true });
}
