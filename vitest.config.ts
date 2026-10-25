import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'backend/src/**/__tests__/**/*.test.ts',
      'packages/*/src/**/__tests__/**/*.test.ts',
    ],
    environment: 'node',
  },
});
