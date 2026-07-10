import { describe, expect, it } from 'vitest';
import { renderMermaidArchitecture } from '../context/code-map.js';
describe('FEATURE126 Mermaid architecture', () => {
  it('renders deterministic nodes and real dependency edges', () => {
    expect(renderMermaidArchitecture(['src/b.ts', 'src/a.ts'], [{ from: 'src/a.ts', to: 'src/b.ts' }])).toBe('flowchart LR\n  n1["src/a.ts"]\n  n2["src/b.ts"]\n  n1 --> n2\n');
  });
  it('drops unknown edges and strips label-breaking characters', () => {
    const output = renderMermaidArchitecture(['src/"unsafe".ts'], [{ from: 'missing', to: 'src/"unsafe".ts' }]);
    expect(output).toContain('src/unsafe.ts'); expect(output).not.toContain('-->');
  });
});
