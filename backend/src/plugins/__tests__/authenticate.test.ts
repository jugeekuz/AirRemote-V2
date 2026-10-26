import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildTestApp, testEnv } from '../../__tests__/test-utils';
import {
  signAccessToken,
  signRefreshToken,
} from '../../features/auth/auth.helpers';
import { authenticatedUserId, authenticatePlugin } from '../authenticate';

const secrets = {
  accessSecret: testEnv.JWT_ACCESS_SECRET,
  refreshSecret: testEnv.JWT_REFRESH_SECRET,
};

let app: FastifyInstance;

beforeEach(async () => {
  app = await buildTestApp();
  await app.register(authenticatePlugin, { secrets });
  app.get('/whoami', { preHandler: app.authenticate }, async (request) => ({
    userId: authenticatedUserId(request),
  }));
  app.get('/open', async () => ({ ok: true }));
});

afterEach(async () => {
  vi.useRealTimers();
  await app.close();
});

const whoami = (authorization?: string) =>
  app.inject({
    method: 'GET',
    url: '/whoami',
    headers: authorization === undefined ? {} : { authorization },
  });

describe('authenticate', () => {
  it('lets a valid access token through with its user id', async () => {
    const token = await signAccessToken('user-1', secrets);
    const res = await whoami(`Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ userId: 'user-1' });
  });

  it('accepts the scheme in any case', async () => {
    const token = await signAccessToken('user-1', secrets);
    expect((await whoami(`bearer ${token}`)).statusCode).toBe(200);
  });

  const otherSecrets = {
    accessSecret: 'another-access-secret-0123456789abcdef',
    refreshSecret: 'another-refresh-secret-0123456789abcdef',
  };

  it.each<[string, () => Promise<string | undefined>]>([
    ['no header', async () => undefined],
    ['another scheme', async () => 'Basic abc'],
    ['no token', async () => 'Bearer'],
    ['two tokens', async () => 'Bearer a b'],
    [
      'a refresh token',
      async () => `Bearer ${await signRefreshToken('user-1', secrets)}`,
    ],
    [
      'a token signed with another secret',
      async () => `Bearer ${await signAccessToken('user-1', otherSecrets)}`,
    ],
    [
      'an expired token',
      async () => {
        vi.useFakeTimers({ toFake: ['Date'], now: Date.now() - 11 * 60_000 });
        const token = await signAccessToken('user-1', secrets);
        vi.useRealTimers();
        return `Bearer ${token}`;
      },
    ],
  ])('answers 401 for %s', async (_case, authorization) => {
    const res = await whoami(await authorization());
    expect(res.statusCode).toBe(401);
    expect(res.headers['www-authenticate']).toBe('Bearer');
    expect(res.json()).toEqual({
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    });
  });

  it('leaves routes without the preHandler open', async () => {
    const res = await app.inject({ method: 'GET', url: '/open' });
    expect(res.statusCode).toBe(200);
  });
});
