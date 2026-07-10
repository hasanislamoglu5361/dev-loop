import React from 'react';

interface BenchmarkResult {
  id: string;
  name?: string;
  timestamp?: string;
  totalTokens?: number;
  totalTimeMs?: number;
  tokensPerSecond?: number;
  costUsd?: number;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatDuration(ms: number): string {
  const seconds = ms / 1000;
  if (seconds < 60) return `${Math.round(seconds * 10) / 10}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return `${minutes}m ${remainingSeconds}s`;
}

export function BenchmarkPage({ results = [] }: { results?: BenchmarkResult[] }): ReturnType<typeof React.createElement> {
  if (results.length === 0) {
    return (
      <div className="benchmark-page">
        <header className="page-header">
          <h2>Benchmarks</h2>
        </header>
        <p>No benchmarks run yet. Run a model benchmark to see performance data here.</p>
      </div>
    );
  }

  return (
    <div className="benchmark-page">
      <header className="page-header">
        <h2>Benchmarks</h2>
        <p>{results.length} benchmark(s) recorded.</p>
      </header>

      <table className="benchmark-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Tokens</th>
            <th>Time</th>
            <th>Tokens/s</th>
            <th>Cost (USD)</th>
            <th>When</th>
          </tr>
        </thead>
        <tbody>
          {results.map(r => (
            <tr key={r.id}>
              <td>{r.name ?? r.id}</td>
              <td>{formatNumber(r.totalTokens ?? 0)}</td>
              <td>{formatDuration(r.totalTimeMs ?? 0)}</td>
              <td>{Math.round(r.tokensPerSecond ?? 0)}</td>
              <td>${(r.costUsd ?? 0).toFixed(4)}</td>
              <td>{r.timestamp ? new Date(r.timestamp).toLocaleString() : '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {results.length > 1 && (
        <section className="benchmark-summary">
          <h3>SUMMARY</h3>
          <div className="summary-grid">
            <SummaryItem label="Best Tokens/s" value={Math.round(Math.max(...results.map(r => r.tokensPerSecond ?? 0)))} />
            <SummaryItem label="Lowest Cost (USD)" value={`$${(Math.min(...results.map(r => r.costUsd ?? Infinity))).toFixed(4)}`} />
          </div>
        </section>
      )}
    </div>
  );
}

function SummaryItem({ label, value }: { label: string; value: number | string }): ReturnType<typeof React.createElement> {
  return (
    <div className="summary-item">
      <span className="label">{label}</span>
      <span className="value">{String(value)}</span>
    </div>
  );
}

export default BenchmarkPage;