import { defineConfig } from 'vitest/config';

const postgresSetup = 'backend/src/__tests__/postgres.global-setup.ts';
const deviceCertsSetup = 'backend/e2e/support/device-certs.global-setup.ts';
const firmwareBuildSetup = 'firmware/e2e/firmware-build.global-setup.ts';

export default defineConfig({
  test: {
    environment: 'node',
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: [
            'backend/src/**/__tests__/**/*.test.ts',
            'packages/*/src/**/__tests__/**/*.test.ts',
            'tools/*/src/**/__tests__/**/*.test.ts',
          ],
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: [
            'backend/src/**/__tests__/**/*.itest.ts',
            'packages/*/src/**/__tests__/**/*.itest.ts',
          ],
          globalSetup: [postgresSetup],
          hookTimeout: 120_000,
        },
      },
      {
        extends: true,
        test: {
          name: 'e2e',
          include: ['backend/e2e/**/*.e2e.ts', 'tools/*/e2e/**/*.e2e.ts'],
          globalSetup: [postgresSetup, deviceCertsSetup],
          hookTimeout: 120_000,
        },
      },
      {
        extends: true,
        test: {
          // The Linux build of the firmware against the real device listener.
          // Its own project: building the firmware takes minutes.
          name: 'firmware',
          include: ['firmware/e2e/**/*.e2e.ts'],
          globalSetup: [postgresSetup, deviceCertsSetup, firmwareBuildSetup],
          hookTimeout: 600_000,
          testTimeout: 60_000,
        },
      },
    ],
  },
});
