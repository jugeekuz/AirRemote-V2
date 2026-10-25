import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import type { Env } from '../../../config/env';
import { buildTestApp, testEnv } from '../../../__tests__/test-utils';
import { AppError } from '../../../shared/errors';
import { authRoutes } from '../auth.routes';
import type { AuthService } from '../auth.service';

let app: FastifyInstance;
let refreshedWith: (string | undefined)[];

const credentials = { email: 'nick@example.com', password: 'correct horse' };

const service: AuthService = {
  async login({ password }) {
    if (password !== 'correct horse') {
      throw new AppError(
        401,
        'INVALID_CREDENTIALS',
        'Invalid email or password',
      );
    }
    return { accessToken: 'access.jwt', refreshToken: 'refresh.jwt' };
  },
  async refresh(refreshToken) {
    refreshedWith.push(refreshToken);
    if (refreshToken !== 'refresh.jwt') {
      throw new AppError(
        401,
        'INVALID_REFRESH_TOKEN',
        'Invalid or expired refresh token',
      );
    }
    return { accessToken: 'new-access.jwt' };
  },
};

async function appWith(env: Env = testEnv) {
  refreshedWith = [];
  app = await buildTestApp();
  await app.register(authRoutes, { prefix: '/auth', env, service });
  return app;
}

afterEach(async () => {
  await app?.close();
});

describe('POST /auth/login', () => {
  it('returns the access token and sets the refresh cookie', async () => {
    await appWith();
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: credentials,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      accessToken: 'access.jwt',
      tokenType: 'Bearer',
      expiresIn: 600,
    });
    expect(res.cookies).toEqual([
      {
        name: 'refresh_token',
        value: 'refresh.jwt',
        maxAge: 604_800,
        path: '/auth',
        httpOnly: true,
        sameSite: 'Strict',
      },
    ]);
    expect(res.body).not.toContain('refresh.jwt');
  });

  it('marks the cookie Secure in production', async () => {
    await appWith({ ...testEnv, NODE_ENV: 'production' });
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: credentials,
    });
    expect(res.cookies[0]).toMatchObject({
      name: 'refresh_token',
      secure: true,
    });
  });

  it('returns 401 and sets no cookie for bad credentials', async () => {
    await appWith();
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { ...credentials, password: 'wrong horse' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({
      error: {
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password',
      },
    });
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('returns 400 for an invalid body', async () => {
    await appWith();
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'nick' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_FAILED');
  });
});

describe('POST /auth/refresh', () => {
  it('exchanges the refresh cookie for a new access token', async () => {
    await appWith();
    const res = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      cookies: { refresh_token: 'refresh.jwt' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      accessToken: 'new-access.jwt',
      tokenType: 'Bearer',
      expiresIn: 600,
    });
    expect(refreshedWith).toEqual(['refresh.jwt']);
  });

  it('returns 401 when there is no refresh cookie', async () => {
    await appWith();
    const res = await app.inject({ method: 'POST', url: '/auth/refresh' });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('INVALID_REFRESH_TOKEN');
    expect(refreshedWith).toEqual([undefined]);
  });
});

describe('POST /auth/logout', () => {
  it('clears the refresh cookie and returns 204', async () => {
    await appWith();
    const res = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      cookies: { refresh_token: 'refresh.jwt' },
    });
    expect(res.statusCode).toBe(204);
    expect(res.body).toBe('');
    const [cookie] = res.cookies;
    expect(cookie).toMatchObject({
      name: 'refresh_token',
      value: '',
      path: '/auth',
    });
    expect(cookie!.expires!.getTime()).toBeLessThan(Date.now());
  });

  it('succeeds without a cookie too', async () => {
    await appWith();
    const res = await app.inject({ method: 'POST', url: '/auth/logout' });
    expect(res.statusCode).toBe(204);
  });
});
