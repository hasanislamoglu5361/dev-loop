import fs from 'node:fs';
import { fromRoot } from './repo-paths.js';

export type WorkspacePackageName = 'core' | 'cli' | 'ui';

export function readRootPackageJson(): Record<string, unknown> {
  return readJsonFile(fromRoot('package.json'));
}

export function readPackageJson(packageName: WorkspacePackageName): Record<string, unknown> {
  return readJsonFile(fromRoot('packages', packageName, 'package.json'));
}

export function readJsonFile(filePath: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as Record<string, unknown>;
}
