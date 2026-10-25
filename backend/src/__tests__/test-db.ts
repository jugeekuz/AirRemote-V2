import { randomUUID } from 'node:crypto';
import { createDb, type Database, type DbHandle } from '@airremote/db';
import { sql } from 'drizzle-orm';
import postgres from 'postgres';
import { afterAll, beforeAll, beforeEach, inject } from 'vitest';

export type TestDatabase = {
  url: string;
  /** Empties every application table. */
  truncate(): Promise<void>;
  drop(): Promise<void>;
};

function withDatabase(url: string, database: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${database}`;
  return parsed.toString();
}

/** Creates a fresh, migrated database by cloning the run's template database. */
export async function createTestDatabase(): Promise<TestDatabase> {
  const templateUrl = inject('postgresTemplateUrl');
  const template = new URL(templateUrl).pathname.slice(1);
  const name = `test_${randomUUID().replaceAll('-', '')}`;
  const admin = postgres(withDatabase(templateUrl, 'postgres'), {
    max: 1,
    onnotice: () => {},
  });
  await admin.unsafe(`CREATE DATABASE "${name}" TEMPLATE "${template}"`);

  const url = withDatabase(templateUrl, name);
  const client = postgres(url, { max: 1, onnotice: () => {} });

  return {
    url,
    async truncate() {
      const tables = await client<{ name: string }[]>`
        select quote_ident(tablename) as name from pg_tables where schemaname = 'public'`;
      if (tables.length > 0) {
        await client.unsafe(
          `TRUNCATE ${tables.map((t) => t.name).join(', ')} CASCADE`,
        );
      }
    },
    async drop() {
      await client.end();
      await admin.unsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      await admin.end();
    },
  };
}

/**
 * Gives the calling test file its own database and Drizzle client, emptied
 * before every test. Use it at the top level of an *.itest.ts file.
 */
export function useTestDatabase(): { readonly db: Database } {
  let database: TestDatabase | undefined;
  let handle: DbHandle | undefined;

  beforeAll(async () => {
    database = await createTestDatabase();
    handle = createDb(database.url);
    await handle.db.execute(sql`select 1`);
  });

  beforeEach(async () => {
    await database?.truncate();
  });

  afterAll(async () => {
    await handle?.close();
    await database?.drop();
  });

  return {
    get db() {
      if (!handle) throw new Error('useTestDatabase: database not ready yet');
      return handle.db;
    },
  };
}
