import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  PathSafetyError,
  resolveProjectPath,
} from '../utils/path-safety.js';

describe('FEATURE038 - project path safety helpers', () => {
  it('resolves normal nested project-relative paths', () => {
    const projectRoot = path.join(os.tmpdir(), 'dev-loop-path-safe');

    const result = resolveProjectPath(projectRoot, 'src/nested/file.ts');

    expect(result).toEqual({
      projectRoot: path.resolve(projectRoot),
      absolutePath: path.join(path.resolve(projectRoot), 'src', 'nested', 'file.ts'),
      relativePath: 'src/nested/file.ts',
    });
  });

  it('rejects path traversal outside the project root', () => {
    const projectRoot = path.join(os.tmpdir(), 'dev-loop-path-safe');

    expect(() => resolveProjectPath(projectRoot, '../outside.ts')).toThrow(PathSafetyError);
    expect(() => resolveProjectPath(projectRoot, 'src/../../outside.ts')).toThrow(/outside project root/);
  });

  it('rejects absolute paths unless explicitly allowed', () => {
    const projectRoot = path.join(os.tmpdir(), 'dev-loop-path-safe');
    const absoluteInside = path.join(projectRoot, 'src', 'inside.ts');

    expect(() => resolveProjectPath(projectRoot, absoluteInside)).toThrow(/Absolute paths are not allowed/);

    expect(resolveProjectPath(projectRoot, absoluteInside, { allowAbsolute: true })).toEqual({
      projectRoot: path.resolve(projectRoot),
      absolutePath: path.resolve(absoluteInside),
      relativePath: 'src/inside.ts',
    });
  });

  it('rejects absolute paths that stay outside the project even when absolutes are allowed', () => {
    const projectRoot = path.join(os.tmpdir(), 'dev-loop-path-safe');
    const outside = path.join(os.tmpdir(), 'outside.ts');

    expect(() => resolveProjectPath(projectRoot, outside, { allowAbsolute: true }))
      .toThrow(/outside project root/);
  });

  it('normalizes backslash separators for stable relative paths', () => {
    const projectRoot = path.join(os.tmpdir(), 'dev-loop-path-safe');

    const result = resolveProjectPath(projectRoot, 'src\\windows\\file.ts');

    expect(result.relativePath).toBe('src/windows/file.ts');
    expect(result.absolutePath).toBe(path.join(path.resolve(projectRoot), 'src', 'windows', 'file.ts'));
  });
});
