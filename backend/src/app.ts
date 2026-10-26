import { createDb, type DbHandle } from '@airremote/db';
import cookie from '@fastify/cookie';
import Fastify, { type FastifyInstance } from 'fastify';
import type { Env } from './config/env';
import { loggerOptions } from './config/logger';
import { authRoutes } from './features/auth/auth.routes';
import { devicesRoutes } from './features/devices/devices.routes';
import { healthRoutes } from './features/health/health.routes';
import { usersRoutes } from './features/users/users.routes';
import { authenticatePlugin } from './plugins/authenticate';
import { dbPlugin } from './plugins/db';
import { errorHandlerPlugin } from './plugins/error-handler';
import { zodPlugin } from './plugins/zod';

export interface BuildAppOptions {
  env: Env;
  /**
   * A handle the caller owns and closes. When omitted, the app creates one
   * from `DATABASE_URL` and closes it on shutdown.
   */
  db?: DbHandle;
}

/** Creates and configures the Fastify instance without listening. */
export async function buildApp({
  env,
  db,
}: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: loggerOptions(env) });

  await app.register(zodPlugin);
  await app.register(errorHandlerPlugin);
  await app.register(cookie);
  await app.register(dbPlugin, {
    handle: db ?? createDb(env.DATABASE_URL),
    close: !db,
  });
  await app.register(authenticatePlugin, {
    secrets: {
      accessSecret: env.JWT_ACCESS_SECRET,
      refreshSecret: env.JWT_REFRESH_SECRET,
    },
  });

  await app.register(healthRoutes);
  await app.register(usersRoutes, { prefix: '/users' });
  await app.register(authRoutes, { prefix: '/auth', env });
  await app.register(devicesRoutes, { prefix: '/devices', env });

  return app;
}
