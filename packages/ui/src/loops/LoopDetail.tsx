import React from 'react';

interface LoopTurn {
  id: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  success?: boolean | null;
  errorMessage?: string;
  durationMs?: number;
}

interface LoopDetailProps {
  loopId: string;
  status?: string;
  feature?: string;
  model?: string;
  turns: LoopTurn[];
  error?: string;
}

export function LoopDetail({ loopId, status = 'unknown', feature, model, turns, error }: LoopDetailProps): ReturnType<typeof React.createElement> {
  return (
    <div className="loop-detail">
      <header className="loop-detail-header">
        <h2>Loop: {loopId}</h2>
        <span className={`status-badge status-${status}`}>{status}</span>
      </header>

      {feature && <p className="loop-feature">Feature: {feature}</p>}
      {model && <p className="loop-model">Model: {model}</p>}

      {error && (
        <section className="loop-error" role="alert">
          ⚠️ {error}
        </section>
      )}

      <section className="loop-summary">
        <div className="summary-grid">
          <div className="summary-item">
            <span className="label">Total Turns</span>
            <span className="value">{turns.length}</span>
          </div>
          <div className="summary-item">
            <span className="label">Success Rate</span>
            <span className="value">{getSuccessRate(turns)}%</span>
          </div>
          <div className="summary-item">
            <span className="label">Total Tokens</span>
            <span className="value">{getTotalTokens(turns)}</span>
          </div>
        </div>
      </section>

      {turns.length === 0 ? (
        <p>No turns recorded.</p>
      ) : (
        <section className="loop-turns">
          <h3>TURNS</h3>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Model</th>
                <th>In</th>
                <th>Out</th>
                <th>Result</th>
                <th>Duration</th>
              </tr>
            </thead>
            <tbody>
              {turns.map((turn, index) => (
                <tr key={turn.id || index}>
                  <td>{index + 1}</td>
                  <td>{turn.model ?? '-'}</td>
                  <td>{turn.inputTokens ? formatNumber(turn.inputTokens) : '-'}</td>
                  <td>{turn.outputTokens ? formatNumber(turn.outputTokens) : '-'}</td>
                  <td>
                    {turn.success === null || turn.success === undefined ? (
                      <span className="status-pending">Pending</span>
                    ) : turn.success ? (
                      <span className="status-success">✓ Pass</span>
                    ) : (
                      <span className="status-failure">✗ Fail</span>
                    )}
                  </td>
                  <td>{turn.durationMs ? formatDuration(turn.durationMs) : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

function getSuccessRate(turns: LoopTurn[]): number {
  const withResult = turns.filter(t => t.success !== null && t.success !== undefined);
  if (withResult.length === 0) return 0;
  const passed = withResult.filter(t => t.success).length;
  return Math.round((passed / withResult.length) * 100);
}

function getTotalTokens(turns: LoopTurn[]): number {
  return turns.reduce((sum, t) => sum + (t.inputTokens ?? 0) + (t.outputTokens ?? 0), 0);
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return `${minutes}m ${remainingSeconds}s`;
}

export default LoopDetail;