import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { enrichFeatureFile } from '../../models/verifier/enrich.js';

describe('FEATURE056 - Verifier Feature Enrichment', () => {
  it('appends auto-enriched warnings without overwriting user requirements', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dev-loop-enrich-'));
    const featurePath = path.join(dir, 'FEATURE999.md');
    await fs.writeFile(featurePath, '# Feature\n\nUser requirements stay here.\n');

    await enrichFeatureFile({
      featurePath,
      knownPatterns: [
        { title: 'Falsy defaults', warning: 'Use nullish checks', secret: 'sk-secret-value-1234567890' },
        { title: 'SQL identifiers', warning: 'Allow-list identifiers' },
      ],
      mcpSuggestions: ['Use filesystem.read_file before editing'],
      affectedFiles: ['packages/core/src/models/selector.ts'],
      effort: { level: 'medium', reason: 'Touches model selection' },
    });

    const content = await fs.readFile(featurePath, 'utf8');
    expect(content).toContain('User requirements stay here.');
    expect(content).toContain('## Auto-Enriched Verifier Context');
    expect(content).toContain('Falsy defaults');
    expect(content).toContain('Use filesystem.read_file');
    expect(content).toContain('packages/core/src/models/selector.ts');
    expect(content).toContain('medium');
    expect(content).not.toContain('sk-secret-value');
    expect(content).toContain('[REDACTED]');
  });

  it('replaces the auto section on second run without duplication or prompt bloat', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dev-loop-enrich-'));
    const featurePath = path.join(dir, 'FEATURE999.md');
    await fs.writeFile(featurePath, '# Feature\n\nOriginal body.\n');

    await enrichFeatureFile({
      featurePath,
      knownPatterns: [{ title: 'Old pattern', warning: 'old' }],
      mcpSuggestions: ['old tool'],
      affectedFiles: ['old.ts'],
      effort: { level: 'low', reason: 'old' },
    });
    await enrichFeatureFile({
      featurePath,
      knownPatterns: [
        { title: 'New pattern 1', warning: 'new 1' },
        { title: 'New pattern 2', warning: 'new 2' },
        { title: 'New pattern 3', warning: 'new 3' },
        { title: 'New pattern 4', warning: 'new 4' },
      ],
      mcpSuggestions: ['new tool'],
      affectedFiles: ['new.ts'],
      effort: { level: 'high', reason: 'new' },
      maxPatterns: 2,
    });

    const content = await fs.readFile(featurePath, 'utf8');
    expect(content.match(/## Auto-Enriched Verifier Context/g)).toHaveLength(1);
    expect(content).not.toContain('Old pattern');
    expect(content).toContain('New pattern 1');
    expect(content).toContain('New pattern 2');
    expect(content).not.toContain('New pattern 3');
    expect(content).toContain('Original body.');
  });
});
