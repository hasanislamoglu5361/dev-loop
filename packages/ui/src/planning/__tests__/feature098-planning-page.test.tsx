import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PlanningPage } from '../PlanningPage.js';

describe('FEATURE098 - PlanningPage', () => {
  it('renders default state with no config', () => {
    const html = renderToStaticMarkup(<PlanningPage />);

    expect(html).toContain('Planning Configuration');
    expect(html).toContain('Auto-scoring disabled');
  });

  it('renders a populated config with primary model, auto-select, and scoring', () => {
    const html = renderToStaticMarkup(
      <PlanningPage
        config={{
          primary: { provider: 'anthropic', model: 'claude-sonnet', temperature: 0.2, maxTokens: 128000 },
          autoSelect: true,
          scoring: true,
        }}
      />,
    );

    expect(html).toContain('anthropic');
    expect(html).toContain('claude-sonnet');
    expect(html).toContain('0.2');
    expect(html).toContain('128.0K');
    expect(html).toContain('Auto-Select');
    expect(html).toContain('Auto-scoring enabled');
  });
});
