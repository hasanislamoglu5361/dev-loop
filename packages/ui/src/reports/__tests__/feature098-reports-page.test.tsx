import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ReportsPage } from '../ReportsPage.js';

describe('FEATURE098 - ReportsPage', () => {
  it('renders an empty-state page with no reports', () => {
    const html = renderToStaticMarkup(<ReportsPage reports={[]} />);

    expect(html).toContain('Reports');
    expect(html).toContain('No reports generated yet.');
  });

  it('renders populated reports with format, size, and created date', () => {
    const html = renderToStaticMarkup(
      <ReportsPage
        reports={[
          { id: 'r1', name: 'weekly-summary', format: 'csv', createdAt: '2026-06-01T00:00:00.000Z', sizeBytes: 2048 },
          { id: 'r2', name: 'audit', format: 'pdf', sizeBytes: 3 * 1024 * 1024 },
        ]}
      />,
    );

    expect(html).toContain('weekly-summary');
    expect(html).toContain('CSV');
    expect(html).toContain('2.0 KB');
    expect(html).toContain('3.0 MB');
    expect(html).toContain('2 report(s) generated.');
    expect(html).toContain('Download');
  });
});
