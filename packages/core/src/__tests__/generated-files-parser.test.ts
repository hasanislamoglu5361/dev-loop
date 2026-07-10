import { describe, expect, it } from 'vitest';
import {
  GeneratedFileParseError,
  parseGeneratedFiles,
} from '../utils/generated-files.js';

describe('FEATURE036 - generated file parsing helpers', () => {
  it('parses multiple generated files from realistic fenced Markdown blocks', () => {
    const output = [
      'Here are the files you asked for.',
      '',
      '```ts',
      '// FILE: src/index.ts',
      'export const answer = 42;',
      '```',
      '',
      'Some explanation between files.',
      '',
      '```python',
      '# FILE: scripts/build.py',
      'print("build")',
      '```',
      '',
      'Done.',
    ].join('\n');

    const parsed = parseGeneratedFiles(output);

    expect(parsed.text.trim()).toBe([
      'Here are the files you asked for.',
      'Some explanation between files.',
      'Done.',
    ].join('\n\n'));
    expect(parsed.files).toEqual([
      {
        path: 'src/index.ts',
        content: 'export const answer = 42;\n',
        language: 'ts',
        overwrite: true,
      },
      {
        path: 'scripts/build.py',
        content: 'print("build")\n',
        language: 'python',
        overwrite: true,
      },
    ]);
  });

  it('parses adjacent non-fenced FILE marker blocks', () => {
    const parsed = parseGeneratedFiles([
      '// FILE: src/a.ts',
      'export const a = 1;',
      '// FILE: src/b.ts',
      'export const b = 2;',
    ].join('\n'));

    expect(parsed.text).toBe('');
    expect(parsed.files.map(file => file.path)).toEqual(['src/a.ts', 'src/b.ts']);
    expect(parsed.files.map(file => file.content)).toEqual([
      'export const a = 1;\n',
      'export const b = 2;\n',
    ]);
  });

  it('does not assume the language tag equals the file extension', () => {
    const parsed = parseGeneratedFiles([
      '```python',
      '// FILE: src/not-python.ts',
      'export const value = "typescript path";',
      '```',
    ].join('\n'));

    expect(parsed.files[0]).toEqual({
      path: 'src/not-python.ts',
      content: 'export const value = "typescript path";\n',
      language: 'python',
      overwrite: true,
    });
  });

  it('rejects malformed FILE markers with actionable errors', () => {
    expect(() => parseGeneratedFiles('// FILE:\nmissing path')).toThrow(GeneratedFileParseError);
    expect(() => parseGeneratedFiles('// FILE:\nmissing path')).toThrow(/missing file path/i);
  });

  it('rejects unsafe generated file paths', () => {
    expect(() => parseGeneratedFiles([
      '```ts',
      '// FILE: ../secrets.ts',
      'export const leaked = true;',
      '```',
    ].join('\n'))).toThrow(/Unsafe generated file path/);

    expect(() => parseGeneratedFiles([
      '```ts',
      '// FILE: /tmp/absolute.ts',
      'export const absolute = true;',
      '```',
    ].join('\n'))).toThrow(/Unsafe generated file path/);
  });
});
