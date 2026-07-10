import React from 'react';

interface PlanningConfig {
  primary?: {
    provider?: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
  };
  autoSelect?: boolean;
  scoring?: boolean;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function PlanningPage({ config }: { config?: PlanningConfig }): ReturnType<typeof React.createElement> {
  const cfg = config ?? {};

  return (
    <div className="planning-page">
      <header className="page-header">
        <h2>Planning Configuration</h2>
      </header>

      <section className="config-section">
        <h3>Primary Model</h3>
        <dl className="config-grid">
          <dt>Provider</dt>
          <dd>{cfg.primary?.provider ?? '-'}</dd>
          <dt>Model</dt>
          <dd>{cfg.primary?.model ?? '-'}</dd>
          <dt>Temperature</dt>
          <dd>{cfg.primary?.temperature !== undefined ? String(cfg.primary.temperature) : '-'}</dd>
          <dt>Max Tokens</dt>
          <dd>{cfg.primary?.maxTokens !== undefined ? formatNumber(cfg.primary.maxTokens) : '-'}</dd>
        </dl>
      </section>

      {cfg.autoSelect && (
        <section className="config-section">
          <h3>Auto-Select</h3>
          <div className="auto-select-options">
            <label><input type="checkbox" checked readOnly /> Enable auto-select</label>
            <label><input type="checkbox" checked={false} readOnly /> Prefer local models</label>
            <label><input type="checkbox" checked={true} readOnly /> Prefer cheapest</label>
            <label><input type="checkbox" checked={false} readOnly /> Prefer fastest</label>
          </div>
        </section>
      )}

      <section className="config-section">
        <h3>Scoring</h3>
        <p>{cfg.scoring ? 'Auto-scoring enabled' : 'Auto-scoring disabled'}</p>
      </section>
    </div>
  );
}

export default PlanningPage;