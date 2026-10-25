import { randomUUID } from 'node:crypto';
import type { LoginRequest } from '@airremote/contracts';
import { AppError } from '../../shared/errors';
import { hashPassword, verifyPassword } from '../../shared/password';
import type { UsersRepository } from '../users/users.repository';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  type TokenSecrets,
} from './auth.helpers';

export type AuthTokens = { accessToken: string; refreshToken: string };

export type AuthService = {
  login(input: LoginRequest): Promise<AuthTokens>;
  /** Exchanges a refresh token (possibly missing) for a new access token. */
  refresh(refreshToken: string | undefined): Promise<{ accessToken: string }>;
};

const invalidCredentials = () =>
  new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');

const invalidRefreshToken = () =>
  new AppError(
    401,
    'INVALID_REFRESH_TOKEN',
    'Invalid or expired refresh token',
  );

export function createAuthService({
  users,
  secrets,
}: {
  users: UsersRepository;
  secrets: TokenSecrets;
}): AuthService {
  // Checked against when the email is unknown, so that case takes as long as a
  // wrong password and does not reveal which emails are registered.
  const dummyHash = hashPassword(randomUUID());

  return {
    async login({ email, password }) {
      const user = await users.findByEmail(email.trim().toLowerCase());
      const stored = user
        ? { hash: user.passwordHash, salt: user.passwordSalt }
        : await dummyHash;
      const matches = await verifyPassword(password, stored.hash, stored.salt);
      if (!user || !matches) throw invalidCredentials();

      return {
        accessToken: await signAccessToken(user.id, secrets),
        refreshToken: await signRefreshToken(user.id, secrets),
      };
    },

    async refresh(refreshToken) {
      const userId = refreshToken
        ? await verifyRefreshToken(refreshToken, secrets)
        : null;
      const user = userId ? await users.findById(userId) : null;
      if (!user) throw invalidRefreshToken();

      return { accessToken: await signAccessToken(user.id, secrets) };
    },
  };
}
