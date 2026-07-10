import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BenchmarkPage } from '../BenchmarkPage.js';
import { buildBenchmarkChartData } from '../chart.js';
describe('FEATURE126 visual system', () => {
  it('normalizes zero, negative, missing and non-finite chart values safely', () => {
    expect(buildBenchmarkChartData([{ id: 'zero', tokensPerSecond: 0 }, { id: 'negative', tokensPerSecond: -2 }, { id: 'missing' }, { id: 'nan', tokensPerSecond: Number.NaN }]).map(item => item.normalized)).toEqual([0, 0, 0, 0]);
    expect(buildBenchmarkChartData([{ id: 'a', tokensPerSecond: 5 }, { id: 'b', tokensPerSecond: 10 }]).map(item => item.normalized)).toEqual([0.5, 1]);
  });
  it('renders an accessible keyboard-focusable real-data chart without Infinity', () => {
    const html = renderToStaticMarkup(<BenchmarkPage results={[{ id: 'a', name: 'Local', tokensPerSecond: 0 }, { id: 'b', name: 'Cloud', tokensPerSecond: 20 }]} />);
    expect(html).toContain('role="img"'); expect(html).toContain('tabindex="0"'); expect(html).toContain('Cloud: 20 tokens per second'); expect(html).not.toContain('Infinity');
  });
});
