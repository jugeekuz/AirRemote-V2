import type {
  FastifyReply,
  FastifyRequest,
  onRequestAsyncHookHandler,
} from 'fastify';
import fp from 'fastify-plugin';
import {
  verifyAccessToken,
  type TokenSecrets,
} from '../features/auth/auth.helpers';
import { AppError } from '../shared/errors';

declare module 'fastify' {
  interface FastifyRequest {
    /** The signed-in user, set by the `authenticate` hook. */
    userId: string | null;
  }
  interface FastifyInstance {
    /**
     * `onRequest` hook for routes that need a signed-in user: 401 without a
     * valid access token, before the body is parsed or validated.
     */
    authenticate: onRequestAsyncHookHandler;
  }
}

const BEARER = /^Bearer (\S+)$/i;

function unauthorized(reply: FastifyReply): AppError {
  reply.header('www-authenticate', 'Bearer');
  return new AppError(401, 'UNAUTHORIZED', 'Authentication required');
}

export const authenticatePlugin = fp<{ secrets: TokenSecrets }>(
  async (app, { secrets }) => {
    app.decorateRequest('userId', null);
    app.decorate('authenticate', async (request, reply) => {
      const token = BEARER.exec(request.headers.authorization ?? '')?.[1];
      const userId = token ? await verifyAccessToken(token, secrets) : null;
      if (!userId) throw unauthorized(reply);
      request.userId = userId;
    });
  },
  { name: 'authenticate' },
);

/** The signed-in user of a route behind `app.authenticate`. */
export function authenticatedUserId(request: FastifyRequest): string {
  if (!request.userId) {
    throw new Error('Route is missing the authenticate hook');
  }
  return request.userId;
}
