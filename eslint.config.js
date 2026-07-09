// @ts-check
// ESLint flat config for TypeScript source files across packages/*/src/**/*.ts
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default [
  // Ignore generated and third-party files (root scope)
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/*.d.ts',
      '**/*.js.map',
      '**/*.d.ts.map',
      '**/tsconfig.tsbuildinfo',
    ],
  },

  // Base ESLint recommended rules (with Node globals)
  {
    ...eslint.configs.recommended,
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
        require: 'readonly',
        module: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        exports: 'readonly',
      },
    },
  },

  // TypeScript-specific config (applied to .ts files)
  {
    files: ['**/*.ts'],
    plugins: {
      '@typescript-eslint': tseslint.plugin,
    },
    languageOptions: {
      parser: tseslint.parser,
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      // Disable base no-unused-vars for .ts — @typescript-eslint handles this correctly
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-undef': 'off',
    },
  },
];
