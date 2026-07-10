import * as fs from 'node:fs/promises';
import path from 'node:path';
import { globFiles, pathExists, readFileSafe, writeFileAtomic } from '../utils/file-system.js';
import { resolveProjectPath } from '../utils/path-safety.js';

export interface McpSandboxOptions {
  projectDir: string;
}

export interface SandboxGeneratedFile {
  path: string;
  content: string;
}

export interface SandboxWriteResult {
  files: string[];
}

export type SandboxDiffStatus = 'added' | 'modified' | 'unchanged';

export interface SandboxDiffFile {
  path: string;
  status: SandboxDiffStatus;
  before: string;
  after: string;
}

export interface SandboxDiffResult {
  files: SandboxDiffFile[];
}

export class McpSandbox {
  private readonly projectDir: string;
  private readonly sandboxDir: string;

  constructor(options: McpSandboxOptions) {
    this.projectDir = path.resolve(options.projectDir);
    this.sandboxDir = path.join(this.projectDir, '.dev-loop', 'sandbox');
  }

  async writeGeneratedFiles(files: SandboxGeneratedFile[]): Promise<SandboxWriteResult> {
    const written: string[] = [];

    for (const file of files) {
      const relativePath = this.resolveSafeRelativePath(file.path);
      const sandboxPath = this.resolveSandboxPath(relativePath);
      await writeFileAtomic(sandboxPath, file.content);
      written.push(relativePath);
    }

    return { files: written.sort() };
  }

  async diff(): Promise<SandboxDiffResult> {
    if (!await pathExists(this.sandboxDir)) {
      return { files: [] };
    }

    const sandboxFiles = await globFiles('**/*', {
      cwd: this.sandboxDir,
      dot: true,
    });
    const files: SandboxDiffFile[] = [];

    for (const relativePath of sandboxFiles) {
      const safeRelativePath = this.resolveSafeRelativePath(relativePath);
      const sandboxPath = this.resolveSandboxPath(safeRelativePath);
      const projectPath = this.resolveProjectFilePath(safeRelativePath);
      const before = await readFileSafe(projectPath);
      const after = await readFileSafe(sandboxPath);

      files.push({
        path: safeRelativePath,
        status: before === ''
          ? 'added'
          : before === after
            ? 'unchanged'
            : 'modified',
        before,
        after,
      });
    }

    return { files };
  }

  async clear(): Promise<void> {
    await fs.rm(this.sandboxDir, { recursive: true, force: true });
  }

  async applyApprovedFiles(paths: string[]): Promise<SandboxWriteResult> {
    const applied: string[] = [];

    for (const requestedPath of paths) {
      const relativePath = this.resolveSafeRelativePath(requestedPath);
      const sandboxPath = this.resolveSandboxPath(relativePath);

      if (!await pathExists(sandboxPath)) {
        throw new Error(`Sandbox file does not exist: ${relativePath}`);
      }

      const content = await fs.readFile(sandboxPath);
      await writeFileAtomic(this.resolveProjectFilePath(relativePath), content);
      applied.push(relativePath);
    }

    return { files: applied.sort() };
  }

  private resolveSafeRelativePath(requestedPath: string): string {
    return resolveProjectPath(this.projectDir, requestedPath).relativePath;
  }

  private resolveProjectFilePath(relativePath: string): string {
    return resolveProjectPath(this.projectDir, relativePath).absolutePath;
  }

  private resolveSandboxPath(relativePath: string): string {
    const resolved = resolveProjectPath(this.sandboxDir, relativePath);
    return resolved.absolutePath;
  }
}
