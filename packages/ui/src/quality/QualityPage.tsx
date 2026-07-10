import React from 'react';

interface QualityCheck {
  name: string;
  passed: boolean;
  message?: string;
}

interface QualityMetrics {
  testCoverage?: number;
  complexityAvg?: number;
  lintErrors?: number;
  typeCoverage?: number;
  totalIssues?: number;
  resolvedIssues?: number;
}

function MetricCard({ label, value, target, inverse }: { label: string; value: string; target: number; inverse?: boolean }): ReturnType<typeof React.createElement> {
  const numValue = parseFloat(value.replace(/[^0-9.-]/g, ''));
  const ok = inverse ? numValue <= target : numValue >= target;

  return (
    <div className={`metric-card ${ok ? 'pass' : 'fail'}`}>
      <span className="label">{label}</span>
      <span className="value">{value}</span>
      <small>Target: {target}</small>
    </div>
  );
}

export function QualityPage({ checks = [], metrics }: { checks?: QualityCheck[]; metrics?: QualityMetrics }): ReturnType<typeof React.createElement> {
  const m = metrics ?? {};
  const allPassed = checks.length > 0 && checks.every(c => c.passed);

  return (
    <div className="quality-page">
      <header className="page-header">
        <h2>Quality Gate</h2>
        {checks.length > 0 ? (
          <span className={`status-badge status-${allPassed ? 'success' : 'failure'}`}>
            {allPassed ? 'PASSED' : 'FAILED'}
          </span>
        ) : (
          <p>No quality checks run yet.</p>
        )}
      </header>

      {checks.length > 0 && (
        <section className="quality-checks">
          <h3>CHECKS</h3>
          <ul>
            {checks.map(check => (
              <li key={check.name} className={check.passed ? 'passed' : 'failed'}>
                <span>{check.passed ? '\u2713' : '\u2717'}</span>
                <strong>{check.name}</strong>
                {!check.passed && check.message && <p className="error-msg">{check.message}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {m.testCoverage !== undefined && (
        <section className="quality-metrics">
          <h3>METRICS</h3>
          <div className="metrics-grid">
            <MetricCard label="Test Coverage" value={`${Math.round(m.testCoverage)}%`} target={80} />
            {m.complexityAvg !== undefined && (
              <MetricCard label="Avg Complexity" value={String(Math.round(m.complexityAvg))} target={10} inverse />
            )}
            <MetricCard label="Lint Errors" value={String(m.lintErrors ?? 0)} target={0} inverse />
            {m.typeCoverage !== undefined && (
              <MetricCard label="Type Coverage" value={`${Math.round(m.typeCoverage)}%`} target={100} />
            )}
          </div>
        </section>
      )}

      {m.totalIssues !== undefined && m.resolvedIssues !== undefined && m.totalIssues > 0 && (
        <section className="issue-progress">
          <h3>ISSUES</h3>
          <p>{m.resolvedIssues}/{m.totalIssues} resolved ({Math.round((m.resolvedIssues / m.totalIssues) * 100)}%)</p>
          <div className="progress-bar" style={{ width: '100%' }}>
            <div className="progress-fill" style={{ width: `${(m.resolvedIssues / m.totalIssues) * 100}%` }} />
          </div>
        </section>
      )}
    </div>
  );
}

export default QualityPage;