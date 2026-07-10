import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { generateCodeMap } from '../context/code-map.js';
import { cleanupTempProject, createTempProject } from './helpers/temp-dir.js';

describe('FEATURE075 - Code Map Generator', () => {
  let projectDir: string | undefined;

  afterEach(() => {
    if (projectDir) {
      cleanupTempProject(projectDir);
      projectDir = undefined;
    }
  });

  it('Test TS file exports/imports', async () => {
    projectDir = createTempProject('dev-loop-code-map-');
    fs.mkdirSync(path.join(projectDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(projectDir, 'src/app.ts'), [
      '// App entry point',
      "import { helper } from './util';",
      'export function run() { return helper(); }',
      '',
    ].join('\n'));
    fs.writeFileSync(path.join(projectDir, 'src/util.ts'), [
      '// Shared helper',
      'export const helper = () => true;',
      '',
    ].join('\n'));

    const result = await generateCodeMap({ projectDir });
    const codeMap = fs.readFileSync(path.join(projectDir, '.dev-loop/CODE_MAP.md'), 'utf8');

    expect(result.files).toEqual(['src/app.ts', 'src/util.ts']);
    expect(codeMap).toContain('- `src/app.ts` - App entry point');
    expect(codeMap).toContain('Imports: `./util`');
    expect(codeMap).toContain('Exports: `run`');
    expect(codeMap).toContain('- `src/app.ts` -> `src/util.ts`');
  });

  it('Test ignored folders', async () => {
    projectDir = createTempProject('dev-loop-code-map-');
    fs.mkdirSync(path.join(projectDir, 'src'), { recursive: true });
    fs.mkdirSync(path.join(projectDir, 'node_modules/pkg'), { recursive: true });
    fs.mkdirSync(path.join(projectDir, 'dist'), { recursive: true });
    fs.mkdirSync(path.join(projectDir, '.dev-loop/sandbox/src'), { recursive: true });
    fs.writeFileSync(path.join(projectDir, 'src/real.ts'), 'export const real = true;\n');
    fs.writeFileSync(path.join(projectDir, 'node_modules/pkg/index.ts'), 'export const ignored = true;\n');
    fs.writeFileSync(path.join(projectDir, 'dist/generated.ts'), 'export const ignored = true;\n');
    fs.writeFileSync(path.join(projectDir, '.dev-loop/sandbox/src/draft.ts'), 'export const ignored = true;\n');

    const result = await generateCodeMap({ projectDir });
    const codeMap = fs.readFileSync(path.join(projectDir, '.dev-loop/CODE_MAP.md'), 'utf8');

    expect(result.files).toEqual(['src/real.ts']);
    expect(codeMap).toContain('src/real.ts');
    expect(codeMap).not.toContain('node_modules');
    expect(codeMap).not.toContain('generated.ts');
    expect(codeMap).not.toContain('sandbox');
  });

  it('Test output contains required sections', async () => {
    projectDir = createTempProject('dev-loop-code-map-');
    fs.mkdirSync(path.join(projectDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(projectDir, 'src/index.ts'), 'export const value = 1;\n');

    const result = await generateCodeMap({ projectDir });

    expect(result.outputPath).toBe(path.join(projectDir, '.dev-loop/CODE_MAP.md'));
    expect(result.content).toContain('# Code Map');
    expect(result.content).toContain('## Tree');
    expect(result.content).toContain('## Files');
    expect(result.content).toContain('## Dependency Graph');
  });
});
