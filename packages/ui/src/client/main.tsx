import { QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { RoutedApplication } from './Router.js';
import { queryClient } from './queryClient.js';

function App(): ReturnType<typeof React.createElement> {
  return (
    <QueryClientProvider client={queryClient}>
      <RoutedApplication />
    </QueryClientProvider>
  );
}

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element #root not found.');
}

createRoot(container).render(<App />);
