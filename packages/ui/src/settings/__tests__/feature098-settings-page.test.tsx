import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SettingsPage } from '../SettingsPage.js';

describe('FEATURE098 - SettingsPage', () => {
  it('renders an empty-state page with no sections', () => {
    const html = renderToStaticMarkup(<SettingsPage sections={[]} />);

    expect(html).toContain('Settings');
    expect(html).toContain('No settings configured.');
  });

  it('renders populated settings sections with non-secret values visible', () => {
    const html = renderToStaticMarkup(
      <SettingsPage
        sections={[
          { name: 'planning', items: { model: 'claude-sonnet', autoSelect: true, maxTokens: 4096 } },
        ]}
      />,
    );

    expect(html).toContain('planning');
    expect(html).toContain('claude-sonnet');
    expect(html).toContain('Max Tokens');
    expect(html).toContain('4096');
  });

  it('redacts secret-looking keys recursively, including nested objects', () => {
    const html = renderToStaticMarkup(
      <SettingsPage
        sections={[
          {
            name: 'planning',
            items: {
              api_key: 'sk-test-123',
              model: 'gpt-4',
              auth: { token: 'ghp_abcdef', password: 'hunter2' },
            },
          },
        ]}
      />,
    );

    expect(html).toContain('[REDACTED]');
    expect(html).not.toContain('sk-test-123');
    expect(html).not.toContain('ghp_abcdef');
    expect(html).not.toContain('hunter2');
    expect(html).toContain('gpt-4');
  });
});
