import React, { useState } from 'react';

interface McpServer {
  id: string;
  name?: string;
  url?: string;
  status?: 'connected' | 'disconnected' | 'error';
  toolsCount?: number;
  resourcesCount?: number;
  latencyMs?: number;
}

export function McpPanel({ servers = [] }: { servers?: McpServer[] }): ReturnType<typeof React.createElement> {
  const [filter, setFilter] = useState<'all' | 'connected' | 'disconnected'>('all');

  const filtered = filter === 'all' ? servers : servers.filter(s => s.status === filter);

  return (
    <div className="mcp-panel">
      <header className="page-header">
        <h2>MCP Servers</h2>
        <p>{servers.length} server(s) configured.</p>
      </header>

      {servers.length > 0 && (
        <nav className="filter-nav">
          {['all', 'connected', 'disconnected'].map(f => (
            <button key={f} type="button" onClick={() => setFilter(f as typeof filter)} className={filter === f ? 'active' : ''}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </nav>
      )}

      {filtered.length === 0 && servers.length > 0 ? (
        <p>No servers match the selected filter.</p>
      ) : filtered.length === 0 ? (
        <p>No MCP servers configured.</p>
      ) : (
        <div className="mcp-servers">
          {filtered.map(server => (
            <McpServerCard key={server.id} server={server} />
          ))}
        </div>
      )}
    </div>
  );
}

function McpServerCard({ server }: { server: McpServer }): ReturnType<typeof React.createElement> {
  return (
    <div className={`mcp-server-card status-${server.status}`}>
      <header>
        <h4>{server.name ?? server.id}</h4>
        <span className="status-badge">{server.status || 'unknown'}</span>
      </header>
      {server.url && <p className="mcp-url">{server.url}</p>}
      <dl className="server-details">
        <dt>Tools</dt><dd>{server.toolsCount ?? 0}</dd>
        <dt>Resources</dt><dd>{server.resourcesCount ?? 0}</dd>
        {server.latencyMs !== undefined && (
          <>
            <dt>Latency</dt><dd>{Math.round(server.latencyMs)}ms</dd>
          </>
        )}
      </dl>
    </div>
  );
}

export default McpPanel;