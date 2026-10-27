import js from '@eslint/js';
import tanstackQuery from '@tanstack/eslint-plugin-query';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

import { layerBoundaryConfigs } from './frontend/eslint/layer-boundaries.mjs';

export default tseslint.config(
  {
    ignores: [
      'legacy/**',
      '**/dist/**',
      '**/node_modules/**',
      'packages/db/migrations/**',
      'firmware/**/build/**',
      '**/managed_components/**',
      'frontend/.expo/**',
      'frontend/android/**',
      'frontend/ios/**',
      'frontend/web-build/**',
      'frontend/coverage/**',
      'frontend/src/ui/heroui/**',
      'frontend/src/ui/uniwind-types.d.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    files: ['backend/src/**/*.ts'],
    ignores: ['backend/src/config/**'],
    rules: {
      'no-restricted-properties': [
        'error',
        {
          object: 'process',
          property: 'env',
          message: 'Read configuration through src/config.',
        },
      ],
    },
  },
  {
    files: ['backend/src/**/*.ts'],
    ignores: ['**/*.repository.ts', '**/__tests__/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['drizzle-orm', 'drizzle-orm/*'],
              message: 'Only repositories talk to Drizzle.',
            },
            {
              group: ['**/shared/pg-errors'],
              message: 'Only repositories read database errors.',
            },
          ],
        },
      ],
    },
  },
  {
    // A separate rule from the Drizzle one above, so neither replaces the other.
    files: ['backend/src/**/*.ts'],
    ignores: ['backend/src/plugins/device-gateway.ts', '**/__tests__/**'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['ws', '@fastify/websocket'],
              message: 'Only plugins/device-gateway.ts touches sockets.',
            },
          ],
        },
      ],
    },
  },
  // Frontend. eslint-plugin-react is left out: it does not support ESLint 10
  // (its peer range stops at ^9.7).
  {
    files: ['frontend/**/*.{ts,tsx}'],
    ...reactHooks.configs.flat.recommended,
  },
  ...tanstackQuery.configs['flat/recommended'].map((config) => ({
    ...config,
    files: ['frontend/**/*.{ts,tsx}'],
  })),
  {
    files: ['frontend/**/*.{ts,tsx}'],
    rules: {
      curly: ['error', 'all'],
      '@typescript-eslint/no-non-null-assertion': 'error',
    },
  },
  {
    // Node scripts and config files next to the app.
    files: ['frontend/*.{js,mjs}', 'frontend/eslint/**/*.mjs'],
    languageOptions: { globals: globals.node },
  },
  {
    // Expo's Metro, Babel and Jest configs (and Jest's resolver) are CommonJS.
    files: ['frontend/*.js'],
    languageOptions: { sourceType: 'commonjs' },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  // Last: each of these carries its files' complete import restrictions.
  ...layerBoundaryConfigs(),
);
