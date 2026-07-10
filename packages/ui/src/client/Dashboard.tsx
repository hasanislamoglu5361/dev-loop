import React from 'react';

type DashboardViewProps = {
  state: 'loading' | 'ready';
  dashboard?: {
    status: string;
    metrics: {
      activeLoops: number;
      successRate: number;
      costUsd: number;
    };
    recentLoops: Array<{
      id: string;
      feature?: string;
      status?: string;
    }>;
    anomaly?: string;
  };
  onAction?: (action: 'run' | 'verify' | 'build') => void;
  actionPending?: boolean;
};

export function DashboardView({ state, dashboard, onAction, actionPending = false }: DashboardViewProps): ReturnType<typeof React.createElement> {
  if (state === 'loading') {
    return (
      <div className="dashboard-loading" role="status">
        Loading dashboard
      </div>
    );
  }

  if (!dashboard) {
    return (
      <div className="dashboard-empty" role="status">
        No data available
      </div>
    );
  }

  const isIdle = dashboard.status === 'idle';

  return (
    <div className="dashboard-view">
      <section className="dashboard-header">
        <h2>Dashboard</h2>
        <span className={`status-badge status-${dashboard.status}`}>
          {isIdle ? 'Idle' : dashboard.status}
        </span>
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
    </div>
  );
}

export default DashboardView;
