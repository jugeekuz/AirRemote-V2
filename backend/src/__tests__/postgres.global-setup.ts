import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { runMigrations } from '@airremote/db';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import postgres from 'postgres';
import type { TestProject } from 'vitest/node';
import { loadTestDatabaseUrl } from '../config/test-database';

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
 * Migrates one template database per test run. Test files clone it (see
 * test-db.ts) instead of migrating their own.
 *
 * The template lives on the server TEST_DATABASE_URL names, when it is set
 * (e.g. inside a container that already runs Postgres); otherwise on a
 * Postgres container started for the run.
 */
export default async function setup(project: TestProject) {
  const serverUrl = loadTestDatabaseUrl();
  const server = serverUrl
    ? await createTemplateOn(serverUrl)
    : await startContainer();
  await runMigrations(server.url, migrationsFolder);
  project.provide('postgresTemplateUrl', server.url);
  return server.stop;
}

async function startContainer() {
  const container = await new PostgreSqlContainer('postgres:18-alpine').start();
  return {
    url: container.getConnectionUri(),
    stop: async () => {
      await container.stop();
    },
  };
}

/** Creates a uniquely named template database, so runs can share the server. */
async function createTemplateOn(serverUrl: string) {
  const name = `test_template_${randomUUID().replaceAll('-', '')}`;
  const admin = postgres(serverUrl, { max: 1, onnotice: () => {} });
  await admin.unsafe(`CREATE DATABASE "${name}"`);
  const url = new URL(serverUrl);
  url.pathname = `/${name}`;
  return {
    url: url.toString(),
    stop: async () => {
      await admin.unsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      await admin.end();
    },
  };
}
