import { QueryClientProvider, useMutation, useQuery } from '@tanstack/react-query';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { AppShell } from './App.js';
import { api } from './api.js';
import { queryClient } from './queryClient.js';

function Root(): ReturnType<typeof React.createElement> {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.getDashboard(),
  });
  const action = useMutation({
    mutationFn: (name: 'run' | 'verify' | 'build') => {
      if (name === 'run') return api.runLoop();
      return api[name]();
    },
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
  });

  if (isLoading) {
    return (
      <div className="dashboard-loading" role="status">
        Loading dashboard
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="dashboard-empty" role="status">
        No data available
      </div>
    );
  }

  return (
    <AppShell
      dashboard={data}
      onAction={name => action.mutate(name)}
      actionPending={action.isPending}
      actionError={action.error instanceof Error ? action.error.message : undefined}
    />
  );
}

function App(): ReturnType<typeof React.createElement> {
  return (
    <QueryClientProvider client={queryClient}>
      <Root />
    </QueryClientProvider>
  );
}

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element #root not found.');
}

createRoot(container).render(<App />);
