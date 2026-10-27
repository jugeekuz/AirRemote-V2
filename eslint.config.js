import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

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
  {
    // Expo's Metro, Babel and Jest configs (and Jest's resolver) are CommonJS.
    files: ['frontend/*.config.js', 'frontend/jest.resolver.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        require: 'readonly',
        module: 'writable',
        __dirname: 'readonly',
      },
    },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
);
