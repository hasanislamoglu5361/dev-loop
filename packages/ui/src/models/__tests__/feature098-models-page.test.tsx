import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ModelsPage } from '../ModelsPage.js';

describe('FEATURE098 - ModelsPage', () => {
  it('renders an empty-state page with no models', () => {
    const html = renderToStaticMarkup(<ModelsPage models={[]} />);

    expect(html).toContain('Models');
    expect(html).toContain('No models found.');
  });

  it('renders populated models with provider, status, latency, and cost', () => {
    const html = renderToStaticMarkup(
      <ModelsPage
        models={[
          { id: 'm1', name: 'Claude Sonnet', provider: 'anthropic', status: 'active', latencyMs: 342.6, costPer1kTokens: 0.003 },
          { id: 'm2', name: 'GPT-4', provider: 'openai', status: 'error' },
        ]}
      />,
    );

    expect(html).toContain('Claude Sonnet');
    expect(html).toContain('anthropic');
    expect(html).toContain('status-active');
    expect(html).toContain('343ms');
    expect(html).toContain('$0.0030');
    expect(html).toContain('status-error');
    expect(html).toContain('Total: 2');
  });
});
