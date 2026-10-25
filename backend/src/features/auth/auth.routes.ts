import {
  accessTokenResponseSchema,
  loginRequestSchema,
  type AccessTokenResponse,
} from '@airremote/contracts';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { Env } from '../../config/env';
import { createUsersRepository } from '../users/users.repository';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_COOKIE,
  refreshCookieOptions,
} from './auth.helpers';
import { createAuthService, type AuthService } from './auth.service';

const bearer = (accessToken: string): AccessTokenResponse => ({
  accessToken,
  tokenType: 'Bearer',
  expiresIn: ACCESS_TOKEN_TTL_SECONDS,
});

export const authRoutes: FastifyPluginAsyncZod<{
  env: Env;
  /** Overrides the service, e.g. with a fake in tests. */
  service?: AuthService;
}> = async (app, { env, service: override }) => {
  const service =
    override ??
    createAuthService({
      users: createUsersRepository(app.db),
      secrets: {
        accessSecret: env.JWT_ACCESS_SECRET,
        refreshSecret: env.JWT_REFRESH_SECRET,
      },
    });
  const cookieOptions = refreshCookieOptions({
    secure: env.NODE_ENV === 'production',
  });

  app.post(
    '/login',
    {
      schema: {
        body: loginRequestSchema,
        response: { 200: accessTokenResponseSchema },
      },
    },
    async (request, reply) => {
      const { accessToken, refreshToken } = await service.login(request.body);
      reply.setCookie(REFRESH_COOKIE, refreshToken, cookieOptions);
      return bearer(accessToken);
    },
  );

  app.post(
    '/refresh',
    { schema: { response: { 200: accessTokenResponseSchema } } },
    async (request) => {
      const { accessToken } = await service.refresh(
        request.cookies[REFRESH_COOKIE],
      );
      return bearer(accessToken);
    },
  );

  app.post('/logout', async (_request, reply) =>
    reply.clearCookie(REFRESH_COOKIE, cookieOptions).code(204).send(),
  );
};
