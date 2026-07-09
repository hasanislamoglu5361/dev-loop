import path from 'node:path';

export const repoRoot = process.cwd();

export function fromRoot(...parts: string[]): string {
  return path.join(repoRoot, ...parts);
}
