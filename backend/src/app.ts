import { createDb, type DbHandle } from '@airremote/db';
import cookie from '@fastify/cookie';
import Fastify, { type FastifyInstance } from 'fastify';
import type { Env } from './config/env';
import { loggerOptions } from './config/logger';
import { authRoutes } from './features/auth/auth.routes';
import { buttonsRoutes } from './features/buttons/buttons.routes';
import type { DeviceCommandTimings } from './features/device-commands/device-commands.service';
import { deviceCommandsRoutes } from './features/device-commands/device-commands.routes';
import { devicesRoutes } from './features/devices/devices.routes';
import { healthRoutes } from './features/health/health.routes';
import { remotesRoutes } from './features/remotes/remotes.routes';
import { usersRoutes } from './features/users/users.routes';
import { authenticatePlugin } from './plugins/authenticate';
import { dbPlugin } from './plugins/db';
import { errorHandlerPlugin } from './plugins/error-handler';
import { openApiPlugin } from './plugins/openapi';
import { zodPlugin } from './plugins/zod';
import {
  createDeviceConnections,
  type DeviceConnections,
} from './shared/device-connections';

export interface BuildAppOptions {
  env: Env;
  /**
   * A handle the caller owns and closes. When omitted, the app creates one
   * from `DATABASE_URL` and closes it on shutdown.
   */
  db?: DbHandle;
  /**
   * The connected devices, shared with the device server so the API can
   * reach them. Defaults to an empty registry of its own.
   */
  connections?: DeviceConnections;
  /**
   * How long a device reads for an IR code, how long a learn command lives
   * and how long a press lives. Defaults to 15 s, 20 s and 5 s; tests
   * shorten them.
   */
  deviceCommandTimings?: DeviceCommandTimings;
}

/** Creates and configures the Fastify instance without listening. */
export async function buildApp({
  env,
  db,
  connections = createDeviceConnections(),
  deviceCommandTimings,
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
  await app.register(openApiPlugin);

  await app.register(healthRoutes);
  await app.register(usersRoutes, { prefix: '/users' });
  await app.register(authRoutes, { prefix: '/auth', env });
  await app.register(devicesRoutes, { prefix: '/devices', env });
  await app.register(remotesRoutes);
  await app.register(buttonsRoutes, {
    connections,
    timings: deviceCommandTimings,
  });
  await app.register(deviceCommandsRoutes, { connections });

  return app;
}
