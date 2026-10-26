import type { Database, DbHandle } from '@airremote/db';
import cookie from '@fastify/cookie';
import Fastify, { type FastifyInstance } from 'fastify';
import type { Env } from '../config/env';
import { errorHandlerPlugin } from '../plugins/error-handler';
import { zodPlugin } from '../plugins/zod';

export const testEnv: Env = {
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  HOST: '127.0.0.1',
  PORT: 0,
  DATABASE_URL: 'postgres://test:test@127.0.0.1:5432/test',
  JWT_ACCESS_SECRET: 'test-access-secret-0123456789abcdef',
  JWT_REFRESH_SECRET: 'test-refresh-secret-0123456789abcdef',
  DEVICE_PORT: 0,
};

export function fakeDb(execute: () => Promise<unknown>): DbHandle {
  return {
    db: { execute } as unknown as Database,
    close: async () => {},
  };
}

/** A Fastify app with validation and error handling but no database, for route tests with fake services. */
export async function buildTestApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(zodPlugin);
  await app.register(errorHandlerPlugin);
  await app.register(cookie);
  return app;
}
