import type { FastifyServerOptions } from 'fastify';
import type { Env } from './env';

/** Logger settings shared by the API and the device server. */
export function loggerOptions(env: Env): FastifyServerOptions['logger'] {
  return {
    level: env.LOG_LEVEL,
    ...(env.NODE_ENV === 'development'
      ? { transport: { target: 'pino-pretty' } }
      : {}),
  };
}
