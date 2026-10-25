import type { CookieSerializeOptions } from '@fastify/cookie';
import { jwtVerify, SignJWT } from 'jose';

export const ACCESS_TOKEN_TTL_SECONDS = 10 * 60;
export const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;
export const REFRESH_COOKIE = 'refresh_token';

export type TokenSecrets = { accessSecret: string; refreshSecret: string };

type TokenType = 'access' | 'refresh';

const encoder = new TextEncoder();

function sign(
  userId: string,
  type: TokenType,
  secret: string,
  ttlSeconds: number,
): Promise<string> {
  return new SignJWT({ type })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(encoder.encode(secret));
}

/** Returns the user id, or null if the token is invalid, expired or of another type. */
async function verify(
  token: string,
  type: TokenType,
  secret: string,
): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, encoder.encode(secret), {
      algorithms: ['HS256'],
      requiredClaims: ['sub', 'exp'],
    });
    return payload.type === type && payload.sub ? payload.sub : null;
  } catch {
    return null;
  }
}

export const signAccessToken = (userId: string, secrets: TokenSecrets) =>
  sign(userId, 'access', secrets.accessSecret, ACCESS_TOKEN_TTL_SECONDS);

export const signRefreshToken = (userId: string, secrets: TokenSecrets) =>
  sign(userId, 'refresh', secrets.refreshSecret, REFRESH_TOKEN_TTL_SECONDS);

export const verifyAccessToken = (token: string, secrets: TokenSecrets) =>
  verify(token, 'access', secrets.accessSecret);

export const verifyRefreshToken = (token: string, secrets: TokenSecrets) =>
  verify(token, 'refresh', secrets.refreshSecret);

/** The refresh cookie is only readable by the server and only sent to /auth. */
export function refreshCookieOptions({
  secure,
}: {
  secure: boolean;
}): CookieSerializeOptions {
  return {
    httpOnly: true,
    sameSite: 'strict',
    path: '/auth',
    maxAge: REFRESH_TOKEN_TTL_SECONDS,
    secure,
  };
}
