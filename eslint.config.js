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
          ],
        },
      ],
    },
  },
);
