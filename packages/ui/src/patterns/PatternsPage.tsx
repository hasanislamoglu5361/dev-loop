import React, { useState } from 'react';

interface PatternEntry {
  id: string;
  name?: string;
  category?: string;
  description?: string;
  hits?: number;
  lastUsed?: string;
}

export function PatternsPage({ patterns = [] }: { patterns?: PatternEntry[] }): ReturnType<typeof React.createElement> {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  const categories = [...new Set(patterns.map(p => p.category).filter(Boolean))] as string[];
  const filtered = patterns.filter(p =>
    (categoryFilter === 'all' || p.category === categoryFilter) &&
    (!search || (p.name?.toLowerCase().includes(search.toLowerCase()) ?? false) || (p.description?.toLowerCase().includes(search.toLowerCase()) ?? false))
  );

  return (
    <div className="patterns-page">
      <header className="page-header">
        <h2>Patterns</h2>
        <p>{patterns.length} pattern(s) recorded.</p>
      </header>

      {categories.length > 0 && (
        <section className="patterns-filters">
          <input type="text" placeholder="Search patterns..." value={search} onChange={e => setSearch(e.target.value)} />
          <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
            <option value="all">All Categories</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </section>
      )}

      {filtered.length === 0 ? (
        <p>{search || categoryFilter !== 'all' ? 'No patterns match the current filters.' : 'No patterns recorded yet.'}</p>
      ) : (
        <div className="patterns-grid">
          {filtered.map(p => (
            <div key={p.id} className="pattern-card">
              <h4>{p.name ?? p.id}</h4>
              {p.category && <span className="pattern-category">{p.category}</span>}
              {p.description && <p>{p.description}</p>}
              <footer>
                <span>Hits: {p.hits ?? 0}</span>
                {p.lastUsed && <small>Last used: {new Date(p.lastUsed).toLocaleDateString()}</small>}
              </footer>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default PatternsPage;
