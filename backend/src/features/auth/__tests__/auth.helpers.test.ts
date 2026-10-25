import { decodeJwt } from 'jose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_TTL_SECONDS,
  refreshCookieOptions,
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} from '../auth.helpers';

const secrets = {
  accessSecret: 'test-access-secret-0123456789abcdef',
  refreshSecret: 'test-refresh-secret-0123456789abcdef',
};
const userId = '6f1c2a52-3c1e-4a8e-9a43-0d5f1f6f2b11';

afterEach(() => {
  vi.useRealTimers();
});

describe('token lifetimes', () => {
  it('are 10 minutes for access tokens and 7 days for refresh tokens', () => {
    expect(ACCESS_TOKEN_TTL_SECONDS).toBe(600);
    expect(REFRESH_TOKEN_TTL_SECONDS).toBe(604_800);
  });

  it('are written into the tokens', async () => {
    const access = decodeJwt(await signAccessToken(userId, secrets));
    const refresh = decodeJwt(await signRefreshToken(userId, secrets));
    expect(access.exp! - access.iat!).toBe(600);
    expect(refresh.exp! - refresh.iat!).toBe(604_800);
    expect(access.sub).toBe(userId);
    expect(refresh.sub).toBe(userId);
  });
});

describe('verifyRefreshToken', () => {
  it('returns the user id of a valid refresh token', async () => {
    const token = await signRefreshToken(userId, secrets);
    expect(await verifyRefreshToken(token, secrets)).toBe(userId);
  });

  it('returns null for an expired refresh token', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-01T00:00:00Z'));
    const token = await signRefreshToken(userId, secrets);
    vi.setSystemTime(new Date('2026-10-08T00:00:01Z'));
    expect(await verifyRefreshToken(token, secrets)).toBeNull();
  });

  it('returns null for a tampered or malformed token', async () => {
    const token = await signRefreshToken(userId, secrets);
    const [header, , signature] = token.split('.');
    const forgedPayload = Buffer.from(
      JSON.stringify({ sub: 'someone-else', type: 'refresh' }),
    ).toString('base64url');
    expect(
      await verifyRefreshToken(
        `${header}.${forgedPayload}.${signature}`,
        secrets,
      ),
    ).toBeNull();
    expect(await verifyRefreshToken('not-a-jwt', secrets)).toBeNull();
  });

  it('does not accept an access token as a refresh token', async () => {
    const access = await signAccessToken(userId, secrets);
    expect(await verifyRefreshToken(access, secrets)).toBeNull();
    // Even if both secrets were (wrongly) the same, the token type differs.
    const same = {
      accessSecret: secrets.refreshSecret,
      refreshSecret: secrets.refreshSecret,
    };
    expect(
      await verifyRefreshToken(await signAccessToken(userId, same), same),
    ).toBeNull();
  });
});

describe('verifyAccessToken', () => {
  it('returns the user id of a valid access token', async () => {
    const token = await signAccessToken(userId, secrets);
    expect(await verifyAccessToken(token, secrets)).toBe(userId);
  });

  it('returns null after 10 minutes', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-01T00:00:00Z'));
    const token = await signAccessToken(userId, secrets);
    vi.setSystemTime(new Date('2026-10-01T00:10:01Z'));
    expect(await verifyAccessToken(token, secrets)).toBeNull();
  });

  it('does not accept a refresh token as an access token', async () => {
    const refresh = await signRefreshToken(userId, secrets);
    expect(await verifyAccessToken(refresh, secrets)).toBeNull();
  });
});

describe('refreshCookieOptions', () => {
  it('is HttpOnly, SameSite=Strict, scoped to /auth and lasts 7 days', () => {
    expect(refreshCookieOptions({ secure: false })).toEqual({
      httpOnly: true,
      sameSite: 'strict',
      path: '/auth',
      maxAge: 604_800,
      secure: false,
    });
  });

  it('is Secure when asked to be', () => {
    expect(refreshCookieOptions({ secure: true }).secure).toBe(true);
  });
});
