import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  indexProjectFiles,
  queryRelevantFiles,
} from '../context/semantic-search.js';
import {
  loadLoopSummaries,
  saveLoopSummary,
} from '../context/memory.js';
import { cleanupTempProject, createTempProject } from './helpers/temp-dir.js';

describe('FEATURE077 - Semantic Search and Memory', () => {
  let projectDir: string | undefined;

  afterEach(() => {
    if (projectDir) {
      cleanupTempProject(projectDir);
      projectDir = undefined;
    }
  });

  it('Test keyword fallback', async () => {
    projectDir = createTempProject('dev-loop-semantic-');
    fs.mkdirSync(path.join(projectDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(projectDir, 'src/auth.ts'), 'export function loginWithToken() { return "auth token"; }\n');
    fs.writeFileSync(path.join(projectDir, 'src/billing.ts'), 'export function invoiceTotal() { return 42; }\n');

    const index = await indexProjectFiles({ projectDir, vectorizer: undefined });
    const results = queryRelevantFiles(index, { query: 'login auth token', topK: 1 });

    expect(index.mode).toBe('keyword');
    expect(results).toEqual([
      expect.objectContaining({ path: 'src/auth.ts', score: expect.any(Number) }),
    ]);
  });

  it('Test top-K ranking', async () => {
    projectDir = createTempProject('dev-loop-semantic-');
    fs.mkdirSync(path.join(projectDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(projectDir, 'src/cache.ts'), 'cache cache cache invalidation store\n');
    fs.writeFileSync(path.join(projectDir, 'src/store.ts'), 'cache store\n');
    fs.writeFileSync(path.join(projectDir, 'src/ui.ts'), 'button view render\n');

    const index = await indexProjectFiles({ projectDir });
    const results = queryRelevantFiles(index, { query: 'cache store', topK: 2 });

    expect(results.map(result => result.path)).toEqual(['src/cache.ts', 'src/store.ts']);
    expect(results[0]?.score).toBeGreaterThanOrEqual(results[1]?.score ?? 0);
  });

  it('does not index huge or generated files', async () => {
    projectDir = createTempProject('dev-loop-semantic-');
    fs.mkdirSync(path.join(projectDir, 'src'), { recursive: true });
    fs.mkdirSync(path.join(projectDir, 'dist'), { recursive: true });
    fs.writeFileSync(path.join(projectDir, 'src/small.ts'), 'small searchable file\n');
    fs.writeFileSync(path.join(projectDir, 'src/huge.ts'), 'x'.repeat(64));
    fs.writeFileSync(path.join(projectDir, 'dist/generated.ts'), 'searchable generated file\n');

    const index = await indexProjectFiles({ projectDir, maxFileBytes: 32 });

    expect(index.files.map(file => file.path)).toEqual(['src/small.ts']);
  });

  it('Test memory save/load', async () => {
    projectDir = createTempProject('dev-loop-memory-');

    await saveLoopSummary({
      projectDir,
      summary: {
        loopId: 'loop-1',
        featureId: 'FEATURE077',
        summary: 'Added local semantic search.',
        files: ['src/search.ts'],
      },
    });
    await saveLoopSummary({
      projectDir,
      summary: {
        loopId: 'loop-2',
        featureId: 'FEATURE077',
        summary: 'Added memory persistence.',
        files: ['src/memory.ts'],
      },
    });

    await expect(loadLoopSummaries({ projectDir })).resolves.toEqual([
      expect.objectContaining({ loopId: 'loop-1', summary: 'Added local semantic search.' }),
      expect.objectContaining({ loopId: 'loop-2', summary: 'Added memory persistence.' }),
    ]);
  });
});
