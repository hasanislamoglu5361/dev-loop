import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PatternsPage } from '../PatternsPage.js';

describe('FEATURE098 - PatternsPage', () => {
  it('renders an empty-state page with no patterns', () => {
    const html = renderToStaticMarkup(<PatternsPage patterns={[]} />);

    expect(html).toContain('Patterns');
    expect(html).toContain('No patterns recorded yet.');
    expect(html).toContain('0 pattern(s) recorded.');
  });

  it('renders populated patterns with category and hits', () => {
    const html = renderToStaticMarkup(
      <PatternsPage
        patterns={[
          { id: 'p1', name: 'Retry with backoff', category: 'resilience', description: 'Exponential backoff on transient errors', hits: 12, lastUsed: '2026-06-01T00:00:00.000Z' },
          { id: 'p2', name: 'Guard clause', category: 'style', hits: 3 },
        ]}
      />,
    );

    expect(html).toContain('Retry with backoff');
    expect(html).toContain('resilience');
    expect(html).toContain('Exponential backoff on transient errors');
    expect(html).toContain('Hits: 12');
    expect(html).toContain('Guard clause');
    expect(html).toContain('2 pattern(s) recorded.');
  });
});
