import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { McpPanel } from '../McpPanel.js';

describe('FEATURE098 - McpPanel', () => {
  it('renders an empty-state page with no servers', () => {
    const html = renderToStaticMarkup(<McpPanel servers={[]} />);

    expect(html).toContain('MCP Servers');
    expect(html).toContain('No MCP servers configured.');
  });

  it('renders populated servers with status, tools, and latency', () => {
    const html = renderToStaticMarkup(
      <McpPanel
        servers={[
          { id: 's1', name: 'filesystem', url: 'stdio://fs', status: 'connected', toolsCount: 5, resourcesCount: 2, latencyMs: 12.4 },
          { id: 's2', name: 'search', status: 'disconnected' },
        ]}
      />,
    );

    expect(html).toContain('filesystem');
    expect(html).toContain('stdio://fs');
    expect(html).toContain('status-connected');
    expect(html).toContain('12ms');
    expect(html).toContain('status-disconnected');
    expect(html).toContain('2 server(s) configured.');
  });
});
