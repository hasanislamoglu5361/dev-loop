import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { QualityPage } from '../QualityPage.js';

describe('FEATURE098 - QualityPage', () => {
  it('renders an empty-state page with no checks', () => {
    const html = renderToStaticMarkup(<QualityPage checks={[]} />);

    expect(html).toContain('Quality Gate');
    expect(html).toContain('No quality checks run yet.');
  });

  it('renders populated checks and metrics, marking overall status', () => {
    const html = renderToStaticMarkup(
      <QualityPage
        checks={[
          { name: 'lint', passed: true },
          { name: 'typecheck', passed: false, message: 'Type error in foo.ts' },
        ]}
        metrics={{ testCoverage: 85, complexityAvg: 4, lintErrors: 0, typeCoverage: 100, totalIssues: 10, resolvedIssues: 7 }}
      />,
    );

    expect(html).toContain('status-failure');
    expect(html).toContain('FAILED');
    expect(html).toContain('Type error in foo.ts');
    expect(html).toContain('7/10 resolved (70%)');
  });

  it('applies inverse pass/fail semantics for metrics where lower is better', () => {
    // lintErrors and complexityAvg are "inverse" metrics: pass only when value <= target.
    const passing = renderToStaticMarkup(
      <QualityPage checks={[{ name: 'lint', passed: true }]} metrics={{ testCoverage: 90, lintErrors: 0, complexityAvg: 5 }} />,
    );
    const failing = renderToStaticMarkup(
      <QualityPage checks={[{ name: 'lint', passed: true }]} metrics={{ testCoverage: 90, lintErrors: 12, complexityAvg: 25 }} />,
    );

    // 0 lint errors (target 0, inverse) => pass; low complexity (target 10, inverse) => pass
    expect(passing).toContain('metric-card pass');
    expect(passing).not.toContain('metric-card fail');

    // 12 lint errors and complexity 25 both exceed their inverse targets => fail
    expect(failing).toContain('metric-card fail');
  });
});
