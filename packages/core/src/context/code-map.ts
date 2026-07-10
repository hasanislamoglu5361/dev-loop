import path from 'node:path';
import { globFiles, readFileSafe, writeFileAtomic } from '../utils/file-system.js';

export interface GenerateCodeMapOptions {
  projectDir: string;
  patterns?: string[];
}

export interface CodeMapFileInfo {
  path: string;
  description: string;
  imports: string[];
  exports: string[];
}

export interface GenerateCodeMapResult {
  outputPath: string;
  files: string[];
  content: string;
}

const DEFAULT_SOURCE_PATTERNS = [
  '**/*.{ts,tsx,js,jsx}',
];

const DEFAULT_IGNORES = [
  '**/node_modules/**',
  '**/dist/**',
  '**/coverage/**',
  '**/.turbo/**',
  '**/.git/**',
  '**/.dev-loop/**',
];

export async function generateCodeMap(options: GenerateCodeMapOptions): Promise<GenerateCodeMapResult> {
  const projectDir = path.resolve(options.projectDir);
  const files = await discoverCodeMapSourceFiles(projectDir, options.patterns);
  const infos: CodeMapFileInfo[] = [];

  for (const file of files) {
    const content = await readFileSafe(path.join(projectDir, file));
    infos.push(analyzeSourceFile(file, content));
  }

  const outputPath = path.join(projectDir, '.dev-loop', 'CODE_MAP.md');
  const content = renderCodeMap(infos);
  await writeFileAtomic(outputPath, content);

  return {
    outputPath,
    files,
    content,
  };
}

export async function discoverCodeMapSourceFiles(
  projectDir: string,
  patterns: string[] = DEFAULT_SOURCE_PATTERNS,
): Promise<string[]> {
  return globFiles(patterns, {
    cwd: projectDir,
    dot: true,
    ignore: DEFAULT_IGNORES,
  });
}

function analyzeSourceFile(filePath: string, content: string): CodeMapFileInfo {
  return {
    path: filePath,
    description: describeFile(content),
    imports: extractImports(content),
    exports: extractExports(content),
  };
}

function renderCodeMap(files: CodeMapFileInfo[]): string {
  const lines = [
    '# Code Map',
    '',
    '## Tree',
    '',
    ...files.map(file => `- ${file.path}`),
    '',
    '## Files',
    '',
  ];

  for (const file of files) {
    lines.push(`- \`${file.path}\` - ${file.description}`);
    lines.push(`  - Imports: ${formatInlineList(file.imports)}`);
    lines.push(`  - Exports: ${formatInlineList(file.exports)}`);
  }

  lines.push('', '## Dependency Graph', '');

  const edges = dependencyEdges(files);
  if (edges.length === 0) {
    lines.push('- No internal dependencies detected.');
  } else {
    lines.push(...edges.map(edge => `- \`${edge.from}\` -> \`${edge.to}\``));
  }

  lines.push('');
  return lines.join('\n');
}

function describeFile(content: string): string {
  const firstComment = content
    .split(/\r?\n/)
    .map(line => line.trim())
    .find(line => line.startsWith('//') || line.startsWith('/**') || line.startsWith('*'));

  if (!firstComment) {
    return 'Source file.';
  }

  return firstComment
    .replace(/^\/\*\*?/, '')
    .replace(/^\*/, '')
    .replace(/^\/\//, '')
    .replace(/\*\/$/, '')
    .trim() || 'Source file.';
}

function extractImports(content: string): string[] {
  const imports = new Set<string>();
  const patterns = [
    /import\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g,
    /export\s+[\s\S]*?\s+from\s+['"]([^'"]+)['"]/g,
    /require\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      imports.add(match[1]);
    }
  }

  return Array.from(imports).sort();
}

function extractExports(content: string): string[] {
  const exports = new Set<string>();
  const patterns = [
    /export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g,
    /export\s+(?:const|let|var|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g,
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      exports.add(match[1]);
    }
  }

  if (/\bexport\s+default\b/.test(content)) {
    exports.add('default');
  }

  return Array.from(exports).sort();
}

function dependencyEdges(files: CodeMapFileInfo[]): Array<{ from: string; to: string }> {
  const knownFiles = new Set(files.map(file => file.path));
  const edges: Array<{ from: string; to: string }> = [];

  for (const file of files) {
    for (const imported of file.imports) {
      const resolved = resolveInternalImport(file.path, imported, knownFiles);
      if (resolved) {
        edges.push({ from: file.path, to: resolved });
      }
    }
  }

  return edges.sort((a, b) => `${a.from}->${a.to}`.localeCompare(`${b.from}->${b.to}`));
}

function resolveInternalImport(
  fromFile: string,
  imported: string,
  knownFiles: Set<string>,
): string | undefined {
  if (!imported.startsWith('.')) {
    return undefined;
  }

  const base = path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), imported));
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.jsx`,
    path.posix.join(base, 'index.ts'),
    path.posix.join(base, 'index.tsx'),
    path.posix.join(base, 'index.js'),
    path.posix.join(base, 'index.jsx'),
  ];

  return candidates.find(candidate => knownFiles.has(candidate));
}

function formatInlineList(values: string[]): string {
  return values.length === 0
    ? 'none'
    : values.map(value => `\`${value}\``).join(', ');
}
