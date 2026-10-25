import { afterEach, describe, expect, it, vi } from 'vitest';
import { testEnv } from '../src/__tests__/test-utils';
import {
  signRefreshToken,
  verifyAccessToken,
} from '../src/features/auth/auth.helpers';
import { useTestApp } from './support/test-app';

const api = useTestApp();

const secrets = {
  accessSecret: testEnv.JWT_ACCESS_SECRET,
  refreshSecret: testEnv.JWT_REFRESH_SECRET,
};

const nick = {
  email: 'nick@example.com',
  firstName: 'Nick',
  lastName: 'Papas',
  password: 'correct horse',
};

function post(path: string, init: { body?: unknown; cookie?: string } = {}) {
  return fetch(`${api.baseUrl}${path}`, {
    method: 'POST',
    headers: {
      ...(init.body !== undefined
        ? { 'content-type': 'application/json' }
        : {}),
      ...(init.cookie ? { cookie: init.cookie } : {}),
    },
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  });
}

/** Registers Nick and logs in, returning the user id, body and refresh cookie. */
async function registerAndLogin() {
  const { id } = await (await post('/users/register', { body: nick })).json();
  const res = await post('/auth/login', {
    body: { email: nick.email, password: nick.password },
  });
  const [setCookie] = res.headers.getSetCookie();
  return { id, res, setCookie: setCookie!, cookie: setCookie!.split(';')[0]! };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('POST /auth/login', () => {
  it('returns an access token and an HttpOnly refresh cookie', async () => {
    const { id, res, setCookie } = await registerAndLogin();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      accessToken: expect.any(String),
      tokenType: 'Bearer',
      expiresIn: 600,
    });
    expect(await verifyAccessToken(body.accessToken, secrets)).toBe(id);

    expect(setCookie).toMatch(/^refresh_token=[^;]+;/);
    expect(setCookie).toContain('Max-Age=604800');
    expect(setCookie).toContain('Path=/auth');
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Strict');
  });

  it('returns 401 INVALID_CREDENTIALS and no cookie for a wrong password', async () => {
    await post('/users/register', { body: nick });
    const res = await post('/auth/login', {
      body: { email: nick.email, password: 'wrong horse' },
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      error: {
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password',
      },
    });
    expect(res.headers.getSetCookie()).toEqual([]);
  });

  it('returns the same 401 for an unknown email', async () => {
    const res = await post('/auth/login', {
      body: { email: 'nobody@example.com', password: 'correct horse' },
    });
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe('INVALID_CREDENTIALS');
  });
});

describe('POST /auth/refresh', () => {
  it('returns a new access token for the refresh cookie', async () => {
    const { id, cookie } = await registerAndLogin();
    const res = await post('/auth/refresh', { cookie });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ tokenType: 'Bearer', expiresIn: 600 });
    expect(await verifyAccessToken(body.accessToken, secrets)).toBe(id);
  });

  it('returns 401 INVALID_REFRESH_TOKEN without a cookie', async () => {
    const res = await post('/auth/refresh');
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe('INVALID_REFRESH_TOKEN');
  });

  it('returns 401 for a tampered refresh token', async () => {
    const { cookie } = await registerAndLogin();
    const res = await post('/auth/refresh', { cookie: `${cookie}x` });
    expect(res.status).toBe(401);
  });

  it('returns 401 for an expired refresh token', async () => {
    const { id } = await registerAndLogin();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() - 8 * 24 * 60 * 60 * 1000);
    const expired = await signRefreshToken(id, secrets);
    vi.useRealTimers();
    const res = await post('/auth/refresh', {
      cookie: `refresh_token=${expired}`,
    });
    expect(res.status).toBe(401);
  });

  it('returns 401 for an access token sent as the refresh cookie', async () => {
    const { res } = await registerAndLogin();
    const { accessToken } = await res.json();
    const refresh = await post('/auth/refresh', {
      cookie: `refresh_token=${accessToken}`,
    });
    expect(refresh.status).toBe(401);
  });
});

describe('POST /auth/logout', () => {
  it('returns 204 and expires the refresh cookie', async () => {
    const { cookie } = await registerAndLogin();
    const res = await post('/auth/logout', { cookie });
    expect(res.status).toBe(204);
    const [cleared] = res.headers.getSetCookie();
    expect(cleared).toMatch(/^refresh_token=;/);
    expect(cleared).toContain('Path=/auth');
    const expires = /Expires=([^;]+)/.exec(cleared!)?.[1];
    expect(new Date(expires!).getTime()).toBeLessThan(Date.now());
  });
});
