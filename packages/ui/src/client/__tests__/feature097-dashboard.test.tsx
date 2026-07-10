import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AppShell } from '../App.js';
import { DashboardView } from '../Dashboard.js';

describe('FEATURE097 - React UI Foundation and Dashboard', () => {
  it('Add render tests for app shell/dashboard', () => {
    const html = renderToStaticMarkup(
      <AppShell
        dashboard={{
          status: 'running',
          metrics: { activeLoops: 2, successRate: 0.75, costUsd: 1.23 },
          recentLoops: [{ id: 'loop-1', feature: 'FEATURE097', status: 'verified' }],
          anomaly: 'Verifier latency is above baseline.',
        }}
      />,
    );

    expect(html).toContain('dev-loop');
    expect(html).toContain('Dashboard');
    expect(html).toContain('FEATURE097');
    expect(html).toContain('Verifier latency is above baseline.');
  });

  it('Test loading and empty states', () => {
    const loading = renderToStaticMarkup(<DashboardView state="loading" />);
    const empty = renderToStaticMarkup(<DashboardView state="ready" dashboard={{
      status: 'idle',
      metrics: { activeLoops: 0, successRate: 0, costUsd: 0 },
      recentLoops: [],
    }} />);

    expect(loading).toContain('Loading dashboard');
    expect(empty).toContain('No recent loops');
    expect(empty).toContain('Idle');
  });
});
