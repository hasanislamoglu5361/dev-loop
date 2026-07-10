import React, { useState } from 'react';

interface ModelInfo {
  id: string;
  provider: string;
  name: string;
  status?: 'active' | 'inactive' | 'error';
  latencyMs?: number;
  costPer1kTokens?: number;
}

export function ModelsPage({ models = [] }: { models?: ModelInfo[] }): ReturnType<typeof React.createElement> {
  const [filter, setFilter] = useState<string>('all');

  const filtered = filter === 'all' ? models : models.filter(m => m.status === filter);

  return (
    <div className="models-page">
      <header className="page-header">
        <h2>Models</h2>
        <nav className="filter-nav">
          {['all', 'active', 'inactive', 'error'].map(status => (
            <button
              key={status}
              type="button"
              onClick={() => setFilter(status)}
              className={filter === status ? 'active' : ''}
            >
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </button>
          ))}
        </nav>
      </header>

      {filtered.length === 0 ? (
        <p>No models found{filter !== 'all' ? ` for filter "${filter}"` : ''}.</p>
      ) : (
        <table className="models-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Provider</th>
              <th>Status</th>
              <th>Latency</th>
              <th>Cost / 1K tokens</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(model => (
              <tr key={model.id}>
                <td>{model.name}</td>
                <td>{model.provider}</td>
                <td><span className={`status-badge status-${model.status || 'unknown'}`}>{model.status || 'unknown'}</span></td>
                <td>{model.latencyMs ? `${Math.round(model.latencyMs)}ms` : '-'}</td>
                <td>${(model.costPer1kTokens ?? 0).toFixed(4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {filtered.length > 0 && (
        <section className="models-summary">
          <p>Total: {filtered.length}</p>
        </section>
      )}
    </div>
  );
}

export default ModelsPage;