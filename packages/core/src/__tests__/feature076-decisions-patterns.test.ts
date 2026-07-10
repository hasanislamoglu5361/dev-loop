import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  appendDecisionEntries,
  detectArchitecturalDecisions,
  extractCodingPatterns,
  writePatternsDocument,
} from '../context/knowledge-docs.js';
import { cleanupTempProject, createTempProject } from './helpers/temp-dir.js';

describe('FEATURE076 - Decisions and Patterns Documents', () => {
  let projectDir: string | undefined;

  afterEach(() => {
    if (projectDir) {
      cleanupTempProject(projectDir);
      projectDir = undefined;
    }
  });

  it('detects likely architectural decisions from loop records and diffs', () => {
    const decisions = detectArchitecturalDecisions([
      {
        loopId: 'loop-1',
        summary: 'Decision: adopt an injected MCP manager for lifecycle control.',
        diff: [
          '+++ b/packages/core/src/runtime/mcp-manager.ts',
          '+export interface McpManagerOptions {',
          '+export class McpManager {',
        ].join('\n'),
      },
      {
        loopId: 'loop-2',
        summary: 'Fixed typo in README.',
        diff: '+spelling\n',
      },
    ]);

    expect(decisions).toEqual([
      expect.objectContaining({
        title: 'adopt an injected MCP manager for lifecycle control.',
        evidence: expect.stringContaining('runtime/mcp-manager.ts'),
        loopId: 'loop-1',
      }),
    ]);
  });

  it('Test append preserves existing content', async () => {
    projectDir = createTempProject('dev-loop-knowledge-');
    fs.mkdirSync(path.join(projectDir, '.dev-loop'), { recursive: true });
    fs.writeFileSync(path.join(projectDir, '.dev-loop/DECISIONS.md'), [
      '# Decisions',
      '',
      'Human note: keep this deployment constraint.',
      '',
    ].join('\n'));

    await appendDecisionEntries({
      projectDir,
      decisions: [
        {
          title: 'Use injected MCP manager lifecycle.',
          evidence: 'runtime/mcp-manager.ts introduced manager class.',
          loopId: 'loop-72',
        },
      ],
    });

    const content = fs.readFileSync(path.join(projectDir, '.dev-loop/DECISIONS.md'), 'utf8');
    expect(content).toContain('Human note: keep this deployment constraint.');
    expect(content).toContain('## Use injected MCP manager lifecycle.');
    expect(content).toContain('- Loop: `loop-72`');
    expect(content).toContain('- Evidence: runtime/mcp-manager.ts introduced manager class.');
  });

  it('Test generated sections are stable', async () => {
    projectDir = createTempProject('dev-loop-knowledge-');
    fs.mkdirSync(path.join(projectDir, 'src'), { recursive: true });
    fs.mkdirSync(path.join(projectDir, 'dist'), { recursive: true });
    fs.writeFileSync(path.join(projectDir, 'src/errors.ts'), [
      'export class AppError extends Error {}',
      '',
    ].join('\n'));
    fs.writeFileSync(path.join(projectDir, 'src/helpers.ts'), [
      'export function helper() { return true; }',
      '',
    ].join('\n'));
    fs.writeFileSync(path.join(projectDir, 'dist/generated.ts'), 'export function ignored() {}\n');

    const patterns = await extractCodingPatterns({ projectDir });
    const first = await writePatternsDocument({ projectDir, patterns });
    const second = await writePatternsDocument({ projectDir, patterns });

    expect(first.content).toBe(second.content);
    expect(first.content).toContain('# Patterns');
    expect(first.content).toContain('## Coding Patterns');
    expect(first.content).toContain('- Named function exports: `src/helpers.ts`');
    expect(first.content).toContain('- Typed error classes: `src/errors.ts`');
    expect(first.content).not.toContain('generated.ts');
  });
});
