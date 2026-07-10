import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BenchmarkPage } from '../BenchmarkPage.js';

describe('FEATURE098 - BenchmarkPage', () => {
  it('renders an empty-state page with no benchmark results', () => {
    const html = renderToStaticMarkup(<BenchmarkPage results={[]} />);

    expect(html).toContain('Benchmarks');
    expect(html).toContain('No benchmarks run yet.');
  });

  it('renders populated benchmark results with tokens, duration, and cost', () => {
    const html = renderToStaticMarkup(
      <BenchmarkPage
        results={[
          { id: 'b1', name: 'sonnet-run', totalTokens: 2_500_000, totalTimeMs: 65_000, tokensPerSecond: 38, costUsd: 1.25, timestamp: '2026-06-01T00:00:00.000Z' },
          { id: 'b2', name: 'haiku-run', totalTokens: 500, totalTimeMs: 500, tokensPerSecond: 100, costUsd: 0.0005 },
        ]}
      />,
    );

    expect(html).toContain('sonnet-run');
    expect(html).toContain('2.5M');
    expect(html).toContain('1m 5s');
    expect(html).toContain('$1.2500');
    expect(html).toContain('2 benchmark(s) recorded.');
  });

  it('computes best tokens/s and lowest cost safely when some results have no cost data', () => {
    // A result missing costUsd is treated as Infinity in the min() so it never
    // wins "Lowest Cost" over a real recorded cost.
    const html = renderToStaticMarkup(
      <BenchmarkPage
        results={[
          { id: 'b1', name: 'no-cost-run', tokensPerSecond: 10 },
          { id: 'b2', name: 'priced-run', tokensPerSecond: 50, costUsd: 0.02 },
        ]}
      />,
    );

    expect(html).toContain('Best Tokens/s');
    expect(html).toContain('50');
    expect(html).toContain('Lowest Cost (USD)');
    expect(html).toContain('$0.0200');
    expect(html).not.toContain('NaN');
  });
});
