import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: [
      { find: '@dev-loop/core/db', replacement: fileURLToPath(new URL('./packages/core/src/db/index.ts', import.meta.url)) },
      { find: '@dev-loop/core', replacement: fileURLToPath(new URL('./packages/core/src/index.ts', import.meta.url)) },
      { find: '@dev-loop/ui', replacement: fileURLToPath(new URL('./packages/ui/src/index.ts', import.meta.url)) },
      { find: '@dev-loop/cli', replacement: fileURLToPath(new URL('./packages/cli/src/index.ts', import.meta.url)) },
    ],
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['packages/*/src/**/*.test.{ts,tsx}', '**/*.test.{ts,tsx}'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['packages/*/src/**/*.ts'],
      exclude: [
        'packages/*/src/**/*.test.ts',
        'packages/*/src/**/*.spec.ts',
        '**/node_modules/**',
        '**/dist/**',
      ],
    },
  },
});
