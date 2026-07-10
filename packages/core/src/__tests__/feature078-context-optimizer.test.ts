import { describe, expect, it } from 'vitest';
import { optimizeContext } from '../context/optimizer.js';

const countTokens = (content: string) => content.split(/\s+/).filter(Boolean).length;

describe('FEATURE078 - Context Optimizer', () => {
  it('Test section priority', () => {
    const result = optimizeContext({
      systemPrompt: 'system prompt stable',
      featureText: 'feature text required',
      relevantFiles: [
        { path: 'src/a.ts', content: 'alpha beta' },
      ],
      codeMap: 'code map summary',
      maxTokens: 20,
      countTokens,
    });

    expect(result.sections.map(section => section.type)).toEqual([
      'system',
      'feature',
      'code_map',
      'file',
    ]);
    expect(result.cacheablePrefix).toContain('system prompt stable');
    expect(result.cacheablePrefix).toContain('feature text required');
  });

  it('Test max token budget enforcement', () => {
    const result = optimizeContext({
      systemPrompt: 'system prompt',
      featureText: 'feature text',
      relevantFiles: [
        { path: 'src/important.ts', content: 'one two three' },
        { path: 'src/too-large.ts', content: 'four five six seven eight nine ten' },
      ],
      codeMap: 'code map summary',
      maxTokens: 10,
      countTokens,
    });

    expect(result.totalTokens).toBeLessThanOrEqual(10);
    expect(result.sections.map(section => section.label)).toContain('src/important.ts');
    expect(result.sections.map(section => section.label)).not.toContain('src/too-large.ts');
    expect(result.dropped.map(section => section.label)).toEqual(['src/too-large.ts']);
  });

  it('Test retry includes BUGS', () => {
    const result = optimizeContext({
      systemPrompt: 'system prompt',
      featureText: 'feature text',
      bugs: 'BUGS: fix retry issue',
      retry: true,
      relevantFiles: [],
      maxTokens: 20,
      countTokens,
    });

    expect(result.sections.map(section => section.type)).toEqual(['system', 'feature', 'bugs']);
    expect(result.content).toContain('BUGS: fix retry issue');
  });
});
