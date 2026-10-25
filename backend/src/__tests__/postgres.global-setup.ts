import { resolve } from 'node:path';
import { runMigrations } from '@airremote/db';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {
    /** Connection string of the migrated template database. */
    postgresTemplateUrl: string;
  }
}

const migrationsFolder = resolve(
  import.meta.dirname,
  '../../../packages/db/migrations',
);

/**
 * Starts one Postgres container per test run and migrates its database once.
 * Test files clone that database (see test-db.ts) instead of migrating their own.
 */
export default async function setup(project: TestProject) {
  const container = await new PostgreSqlContainer('postgres:18-alpine').start();
  const url = container.getConnectionUri();
  await runMigrations(url, migrationsFolder);
  project.provide('postgresTemplateUrl', url);

  return async () => {
    await container.stop();
  };
}
