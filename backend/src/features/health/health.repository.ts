import type { Database } from '@airremote/db';
import { sql } from 'drizzle-orm';

export type HealthRepository = {
  pingDatabase(): Promise<void>;
};

export function createHealthRepository(db: Database): HealthRepository {
  return {
    async pingDatabase() {
      await db.execute(sql`select 1`);
    },
  };
}
