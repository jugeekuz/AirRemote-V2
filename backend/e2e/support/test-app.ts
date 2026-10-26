import { createDb, type Database, type DbHandle } from '@airremote/db';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach } from 'vitest';
import { buildApp } from '../../src/app';
import { testEnv } from '../../src/__tests__/test-utils';
import {
  createTestDatabase,
  type TestDatabase,
} from '../../src/__tests__/test-db';

/**
 * Starts the real app on a random port against the calling file's own
 * database, emptied before every test. Use it at the top level of an *.e2e.ts file.
 */
export function useTestApp(): {
  readonly baseUrl: string;
  /** The app's database, for seeding and checking rows. */
  readonly db: Database;
} {
  let database: TestDatabase | undefined;
  let handle: DbHandle | undefined;
  let app: FastifyInstance | undefined;
  let baseUrl: string | undefined;

  beforeAll(async () => {
    database = await createTestDatabase();
    handle = createDb(database.url);
    app = await buildApp({
      env: { ...testEnv, DATABASE_URL: database.url },
    });
    baseUrl = await app.listen({ host: '127.0.0.1', port: 0 });
  });

  beforeEach(async () => {
    await database?.truncate();
  });

  afterAll(async () => {
    await app?.close();
    await handle?.close();
    await database?.drop();
  });

  return {
    get baseUrl() {
      if (!baseUrl) throw new Error('useTestApp: app not started yet');
      return baseUrl;
    },
    get db() {
      if (!handle) throw new Error('useTestApp: database not ready yet');
      return handle.db;
    },
  };
}
