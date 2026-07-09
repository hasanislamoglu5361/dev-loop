// packages/core/src/utils/file-system.ts
// Cross-platform file system utilities — atomic writes, globbing, safe operations

import * as fs from 'fs';
import * as path from 'path';
import fg from 'fast-glob';

export interface GlobOptions {
  cwd?: string;
  ignore?: string[];
  dot?: boolean;
}

/** Write content to a file atomically (write to temp then rename) */
export async function writeFileAtomic(filePath: string, content: string | Buffer): Promise<void> {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });

  const tmpPath = path.join(dir, `.${path.basename(filePath)}.tmp-${process.pid}`);

  try {
    if (typeof content === 'string') {
      content = Buffer.from(content, 'utf-8');
    }
    fs.writeFileSync(tmpPath, content);
    fs.renameSync(tmpPath, filePath);
  } catch (err) {
    // Clean up temp file on error
    try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
    throw err;
  }
}

/** Read a file with UTF-8 encoding, return empty string if not found */
export async function readFileSafe(filePath: string): Promise<string> {
  try {
    const content = await fs.promises.readFile(filePath, 'utf-8');
    return content;
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return '';
    }
    throw err;
  }
}

/** Check if a file or directory exists */
export async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.promises.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/** List files matching glob patterns. */
export async function globFiles(patterns: string | string[], options: GlobOptions = {}): Promise<string[]> {
  const files = await fg(patterns, {
    cwd: options.cwd ?? process.cwd(),
    onlyFiles: true,
    unique: true,
    dot: options.dot ?? false,
    ignore: options.ignore,
  });

  return files.map(file => file.split(path.sep).join('/')).sort();
}

/** Recursively list all files in a directory matching a glob pattern */
export async function glob(pattern: string, cwd?: string): Promise<string[]> {
  return globFiles(pattern, { cwd });
}

/** Create a directory recursively, no error if it exists */
export async function ensureDir(dirPath: string): Promise<void> {
  await fs.promises.mkdir(dirPath, { recursive: true });
}

/** Delete a file or directory recursively */
export async function removeRecursive(targetPath: string): Promise<void> {
  try {
    const stat = await fs.promises.stat(targetPath);
    if (stat.isDirectory()) {
      await fs.promises.rm(targetPath, { recursive: true, force: true });
    } else {
      await fs.promises.unlink(targetPath);
    }
  } catch { /* ignore if not found */ }
}

/** Move a file atomically (rename) with fallback to copy+delete */
export async function moveFileAtomic(srcPath: string, destPath: string): Promise<void> {
  await ensureDir(path.dirname(destPath));
  try {
    fs.renameSync(srcPath, destPath); // atomic on same filesystem
  } catch {
    // Cross-filesystem fallback
    const content = await fs.promises.readFile(srcPath);
    await writeFileAtomic(destPath, content as Buffer);
    await fs.promises.unlink(srcPath);
  }
}

/** Get file stats safely */
export async function statSafe(filePath: string): Promise<fs.Stats | null> {
  try {
    return await fs.promises.stat(filePath);
  } catch {
    return null;
  }
}

/** List files in a directory with optional filtering */
export async function listFiles(dirPath: string, extensions?: string[]): Promise<string[]> {
  try {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
    let files = entries
      .filter(e => e.isFile())
      .map(e => path.join(dirPath, e.name));

    if (extensions && extensions.length > 0) {
      const extSet = new Set(extensions.map(ext => ext.startsWith('.') ? ext : `.${ext}`));
      files = files.filter(f => extSet.has(path.extname(f).toLowerCase()));
    }

    return files.sort();
  } catch {
    return [];
  }
}

/** Sleep utility */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Debounce a function call — returns a promise that resolves after debounce delay */
export function debounce<T extends (...args: any[]) => void>(
  fn: T,
  delayMs: number,
): ((...args: Parameters<T>) => void) {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return (...args: Parameters<T>) => {
    if (timeoutId !== null) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => { fn(...args); }, delayMs);
  };
}
