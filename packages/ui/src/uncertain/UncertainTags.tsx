import React, { useState } from 'react';

interface UncertainItem {
  id: string;
  tag?: string;
  description?: string;
  file?: string;
  line?: number;
  resolved?: boolean;
  resolvedAt?: string;
}

type ResolveAction = 'accept' | 'reject' | 'defer';

export function UncertainTags({ items = [] }: { items?: UncertainItem[] }): ReturnType<typeof React.createElement> {
  const [filter, setFilter] = useState<'all' | 'pending' | 'resolved'>('all');

  const filtered = filter === 'all' ? items : items.filter(i =>
    filter === 'pending' ? !i.resolved : i.resolved ?? false
  );

  return (
    <div className="uncertain-tags-page">
      <header className="page-header">
        <h2>Uncertain Tags</h2>
        <nav className="filter-nav">
          {['all', 'pending', 'resolved'].map(f => (
            <button key={f} type="button" onClick={() => setFilter(f as typeof filter)} className={filter === f ? 'active' : ''}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </nav>
      </header>

      {filtered.length === 0 ? (
        <p>{filter === 'resolved' ? 'No resolved items.' : filter === 'pending' ? 'No pending items — all clean!' : 'No uncertain tags found.'}</p>
      ) : (
        <div className="uncertain-list">
          {filtered.map(item => (
            <UncertainItemRow key={item.id} item={item} />
          ))}
        </div>
      )}

      {!filtered.length && items.some(i => !i.resolved) && (
        <p className="hint">{items.filter(i => !i.resolved).length} pending unresolved tag(s).</p>
      )}
    </div>
  );
}

function UncertainItemRow({ item }: { item: UncertainItem }): ReturnType<typeof React.createElement> {
  const [action, setAction] = useState<ResolveAction | null>(null);

  if (item.resolved) {
    return (
      <div className="uncertain-item resolved">
        <div className="resolved-badge">&#10003; Resolved</div>
        <p>{item.description}</p>
        {item.file && <span className="file-ref">{item.file}{item.line ? `:${item.line}` : ''}</span>}
        {item.resolvedAt && <small>Resolved at: {new Date(item.resolvedAt).toLocaleString()}</small>}
      </div>
    );
  }

  return (
    <div className="uncertain-item pending">
      <h4>{item.tag ?? 'TODO:UNCERTAIN'}</h4>
      <p>{item.description}</p>
      {item.file && <span className="file-ref">{item.file}{item.line ? `:${item.line}` : ''}</span>}

      {!action && (
        <div className="resolve-actions">
          <button type="button" onClick={() => setAction('accept')}>Accept</button>
          <button type="button" onClick={() => setAction('reject')}>Reject</button>
          <button type="button" onClick={() => setAction('defer')}>Defer</button>
        </div>
      )}

      {action && (
        <div className="resolve-result">
          <span className={`status-badge status-${action === 'accept' ? 'success' : action === 'reject' ? 'failure' : 'pending'}`}>
            Action: {action}
          </span>
        </div>
      )}
    </div>
  );
}

export default UncertainTags;