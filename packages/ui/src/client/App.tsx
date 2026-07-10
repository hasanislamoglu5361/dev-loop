import React, { useState } from 'react';

interface DashboardMetrics {
  activeLoops: number;
  successRate: number;
  costUsd: number;
}

interface RecentLoop {
  id: string;
  feature?: string;
  status?: string;
}

interface AppDashboardData {
  status: string;
  metrics: DashboardMetrics;
  recentLoops: RecentLoop[];
  anomaly?: string;
}

interface AppShellProps {
  dashboard: AppDashboardData;
  onAction?: (action: 'run' | 'verify' | 'build') => void;
  actionPending?: boolean;
  actionError?: string;
}

export function AppShell({ dashboard, onAction, actionPending = false, actionError }: AppShellProps): ReturnType<typeof React.createElement> {
  const storage = typeof globalThis.localStorage?.getItem === 'function' ? globalThis.localStorage : undefined;
  const [theme, setTheme] = useState<'light' | 'dark'>(() => storage?.getItem('dev-loop-theme') === 'dark' ? 'dark' : 'light');
  const toggleTheme = () => { const next = theme === 'light' ? 'dark' : 'light'; setTheme(next); storage?.setItem('dev-loop-theme', next); };
  return (
    <div className="dev-loop-app" data-theme={theme}>
      <header className="dev-loop-header">
        <h1>dev-loop</h1>
        <nav>
          <a href="/">Dashboard</a>
          <a href="/loops">Loops</a>
          <a href="/models">Models</a>
          <a href="/mcp">MCP</a>
          <a href="/quality">Quality</a>
          <a href="/planning">Planning</a>
          <a href="/benchmarks">Benchmarks</a>
          <a href="/reports">Reports</a>
          <a href="/settings">Settings</a>
        </nav>
        <button type="button" aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`} onClick={toggleTheme}>Theme: {theme}</button>
      </header>
      <main className="dev-loop-main">
        <section className="dashboard-status">
          <h2>Dashboard</h2>
          <div className={`status-badge status-${dashboard.status}`}>
            Status: {dashboard.status}
          </div>
        </section>

        {dashboard.anomaly && (
          <section className="anomaly-banner" role="alert">
            ⚠️ {dashboard.anomaly}
          </section>
        )}

        <section className="dashboard-metrics">
          <h3>Metrics</h3>
          <div className="metrics-grid">
            <div className="metric-card">
              <span className="metric-label">Active Loops</span>
              <span className="metric-value">{dashboard.metrics.activeLoops}</span>
            </div>
            <div className="metric-card">
              <span className="metric-label">Success Rate</span>
              <span className="metric-value">{Math.round(dashboard.metrics.successRate * 100)}%</span>
            </div>
            <div className="metric-card">
              <span className="metric-label">Cost (USD)</span>
              <span className="metric-value">${dashboard.metrics.costUsd.toFixed(2)}</span>
            </div>
          </div>
        </section>

        <section className="recent-loops">
          <h3>Recent Loops</h3>
          {dashboard.recentLoops.length === 0 ? (
            <p>No recent loops</p>
          ) : (
            <ul>
              {dashboard.recentLoops.map(loop => (
                <li key={loop.id}>
                  <span className="loop-id">{loop.id}</span>
                  {loop.feature && <span className="loop-feature">[{loop.feature}]</span>}
                  <span className={`loop-status status-${loop.status || 'unknown'}`}>{loop.status || 'unknown'}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="quick-actions">
          <h3>Quick Actions</h3>
          {actionError && <p role="alert">{actionError}</p>}
          <button type="button" disabled={actionPending} onClick={() => onAction?.('run')}>
            Run Loop
          </button>
          <button type="button" disabled={actionPending} onClick={() => onAction?.('verify')}>
            Verify
          </button>
          <button type="button" disabled={actionPending} onClick={() => onAction?.('build')}>
            Build
          </button>
        </section>
      </main>
    </div>
  );
}

export type { AppDashboardData, DashboardMetrics, RecentLoop, AppShellProps };
