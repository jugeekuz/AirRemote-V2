import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export type Database = PostgresJsDatabase<typeof schema>;

export interface DbHandle {
  db: Database;
  close(): Promise<void>;
}

/** Creates a Drizzle client. It connects lazily, on the first query. */
export function createDb(connectionString: string): DbHandle {
  const client = postgres(connectionString);
  return {
    db: drizzle(client, { schema }),
    close: () => client.end(),
  };
}
