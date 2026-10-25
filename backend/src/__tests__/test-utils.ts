import type { Database, DbHandle } from '@airremote/db';
import type { Env } from '../config/env';

export const testEnv: Env = {
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  HOST: '127.0.0.1',
  PORT: 0,
  DATABASE_URL: 'postgres://test:test@127.0.0.1:5432/test',
};

export function fakeDb(execute: () => Promise<unknown>): DbHandle {
  return {
    db: { execute } as unknown as Database,
    close: async () => {},
  };
}
