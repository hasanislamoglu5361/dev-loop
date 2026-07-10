import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { RoutedApplication, resolveRoute } from '../Router.js';
describe('FEATURE117 routed application', () => {
  it('maps every direct navigation path deterministically', () => {
    expect(['/','/loops','/models','/mcp','/patterns','/uncertain','/quality','/planning','/benchmarks','/reports','/settings'].map(resolveRoute)).toEqual(['dashboard','loops','models','mcp','patterns','uncertain','quality','planning','benchmarks','reports','settings']);
    expect(resolveRoute('/loops/42')).toBe('loops'); expect(resolveRoute('/missing')).toBe('not-found');
  });
  it('renders an accessible not-found state without issuing an API request', () => {
    const html = renderToStaticMarkup(<QueryClientProvider client={new QueryClient()}><RoutedApplication pathname="/missing" /></QueryClientProvider>);
    expect(html).toContain('role="alert"'); expect(html).toContain('Page not found');
  });
});
