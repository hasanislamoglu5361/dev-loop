import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Vite handles the browser-facing client bundle only. The library/server build
// (tsc, driven by `npm run build`) continues to own `dist/`, so the client
// bundle is emitted to a distinct directory to avoid clobbering it.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist-client',
  },
});
