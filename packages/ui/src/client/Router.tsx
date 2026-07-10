import { useMutation, useQuery } from '@tanstack/react-query';
import React from 'react';
import { BenchmarkPage } from '../benchmark/BenchmarkPage.js';
import { LoopDetail } from '../loops/LoopDetail.js';
import { McpPanel } from '../mcp/McpPanel.js';
import { ModelsPage } from '../models/ModelsPage.js';
import { PatternsPage } from '../patterns/PatternsPage.js';
import { PlanningPage } from '../planning/PlanningPage.js';
import { QualityPage } from '../quality/QualityPage.js';
import { ReportsPage } from '../reports/ReportsPage.js';
import { SettingsPage } from '../settings/SettingsPage.js';
import { UncertainTags } from '../uncertain/UncertainTags.js';
import { api, apiGet } from './api.js';
import { AppShell } from './App.js';
import type { ApiDashboardData } from './api.js';
import { queryClient } from './queryClient.js';

export type AppRoute = 'dashboard' | 'loops' | 'models' | 'mcp' | 'patterns' | 'uncertain' | 'quality' | 'planning' | 'benchmarks' | 'reports' | 'settings' | 'not-found';

export function resolveRoute(pathname: string): AppRoute {
  const normalized = pathname.replace(/\/+$/, '') || '/';
  const routes: Record<string, AppRoute> = { '/': 'dashboard', '/loops': 'loops', '/models': 'models', '/mcp': 'mcp', '/patterns': 'patterns', '/uncertain': 'uncertain', '/quality': 'quality', '/planning': 'planning', '/benchmarks': 'benchmarks', '/reports': 'reports', '/settings': 'settings' };
  return routes[normalized] ?? (normalized.startsWith('/loops/') ? 'loops' : 'not-found');
}

export function RoutedApplication({ pathname = globalThis.location?.pathname ?? '/' }: { pathname?: string }): ReturnType<typeof React.createElement> {
  const route = resolveRoute(pathname);
  if (route === 'not-found') return <PageState kind="error" message="Page not found." />;
  if (route === 'dashboard') return <DashboardRoute />;
  return <ResourceRoute route={route} pathname={pathname} />;
}

function DashboardRoute() {
  const query = useQuery({ queryKey: ['dashboard'], queryFn: () => apiGet<ApiDashboardData>('/dashboard') });
  const action = useMutation({
    mutationFn: (name: 'run' | 'verify' | 'build') => name === 'run' ? api.runLoop() : api[name](),
    onSuccess: async () => { await Promise.all([queryClient.invalidateQueries({ queryKey: ['dashboard'] }), queryClient.invalidateQueries({ queryKey: ['loops'] })]); },
  });
  if (query.isLoading) return <PageState kind="loading" message="Loading dashboard" />;
  if (query.isError || !query.data) return <PageState kind="error" message={errorMessage(query.error)} />;
  return <AppShell dashboard={query.data} onAction={name => action.mutate(name)} actionPending={action.isPending} actionError={action.error ? errorMessage(action.error) : undefined} />;
}

function ResourceRoute({ route, pathname }: { route: Exclude<AppRoute, 'dashboard' | 'not-found'>; pathname: string }) {
  const loopId = route === 'loops' ? pathname.split('/')[2] : undefined;
  const endpoint = loopId ? `/loops/${encodeURIComponent(loopId)}/turns` : `/${route === 'benchmarks' ? 'reports' : route}`;
  const query = useQuery({ queryKey: [route, loopId], queryFn: () => apiGet<unknown>(endpoint) });
  if (query.isLoading) return <PageState kind="loading" message={`Loading ${route}`} />;
  if (query.isError) return <PageState kind="error" message={errorMessage(query.error)} />;
  const data = query.data;
  if (route === 'loops') return <LoopDetail loopId={loopId ?? 'latest'} turns={asArray(data, 'turns')} />;
  if (route === 'models') return <ModelsPage models={asArray(data, 'models')} />;
  if (route === 'mcp') return <McpPanel servers={asArray(data, 'servers')} />;
  if (route === 'patterns') return <PatternsPage patterns={asArray(data, 'patterns')} />;
  if (route === 'uncertain') return <UncertainTags items={asArray(data, 'items')} />;
  if (route === 'quality') return <QualityPage {...asObject(data)} />;
  if (route === 'planning') return <PlanningPage config={asObject(data)} />;
  if (route === 'benchmarks') return <BenchmarkPage results={asArray(data, 'results')} />;
  if (route === 'reports') return <ReportsPage reports={asArray(data, 'reports')} />;
  const config = asObject(data); return <SettingsPage sections={Object.entries(config).map(([name, items]) => ({ name, items: asObject(items) }))} />;
}

function PageState({ kind, message }: { kind: 'loading' | 'error'; message: string }) { return <main className={`page-${kind}`} role={kind === 'error' ? 'alert' : 'status'}><p>{message}</p></main>; }
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : 'No data available'; }
function asObject(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function asArray<T>(value: unknown, key: string): T[] { if (Array.isArray(value)) return value as T[]; const nested = asObject(value)[key]; return Array.isArray(nested) ? nested as T[] : []; }
