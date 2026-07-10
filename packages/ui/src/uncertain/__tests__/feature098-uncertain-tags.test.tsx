import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { UncertainTags } from '../UncertainTags.js';

describe('FEATURE098 - UncertainTags', () => {
  it('renders an empty-state page with no items', () => {
    const html = renderToStaticMarkup(<UncertainTags items={[]} />);

    expect(html).toContain('Uncertain Tags');
    expect(html).toContain('No uncertain tags found.');
  });

  it('renders populated pending and resolved items', () => {
    const html = renderToStaticMarkup(
      <UncertainTags
        items={[
          { id: 'u1', tag: 'TODO:UNCERTAIN', description: 'Check auth flow', file: 'auth.ts', line: 42, resolved: false },
          { id: 'u2', description: 'Old data race', resolved: true, resolvedAt: '2026-01-01T00:00:00.000Z' },
        ]}
      />,
    );

    expect(html).toContain('TODO:UNCERTAIN');
    expect(html).toContain('Check auth flow');
    expect(html).toContain('auth.ts:42');
    expect(html).toContain('Resolved');
    expect(html).toContain('Old data race');
  });

  it('offers distinct Accept, Reject, and Defer actions for a pending item', () => {
    const html = renderToStaticMarkup(
      <UncertainTags items={[{ id: 'u1', description: 'Needs a call', resolved: false }]} />,
    );

    expect(html).toContain('>Accept<');
    expect(html).toContain('>Reject<');
    expect(html).toContain('>Defer<');
  });
});
