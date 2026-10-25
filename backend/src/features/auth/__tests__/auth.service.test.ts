import { describe, expect, it } from 'vitest';
import { AppError } from '../../../shared/errors';
import { hashPassword } from '../../../shared/password';
import { fakeUsersRepository } from '../../users/__tests__/fake-users-repository';
import {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} from '../auth.helpers';
import { createAuthService } from '../auth.service';

const secrets = {
  accessSecret: 'test-access-secret-0123456789abcdef',
  refreshSecret: 'test-refresh-secret-0123456789abcdef',
};

async function setup() {
  const { repository, rows } = fakeUsersRepository();
  const { hash, salt } = await hashPassword('correct horse');
  const user = await repository.create({
    email: 'nick@example.com',
    firstName: 'Nick',
    lastName: 'Papas',
    passwordHash: hash,
    passwordSalt: salt,
  });
  return {
    user: user!,
    rows,
    service: createAuthService({ users: repository, secrets }),
  };
}

const invalidCredentials = {
  statusCode: 401,
  code: 'INVALID_CREDENTIALS',
  message: 'Invalid email or password',
};

const invalidRefresh = {
  statusCode: 401,
  code: 'INVALID_REFRESH_TOKEN',
};

describe('auth service: login', () => {
  it('returns an access token and a refresh token for the user', async () => {
    const { user, service } = await setup();
    const tokens = await service.login({
      email: 'nick@example.com',
      password: 'correct horse',
    });
    expect(await verifyAccessToken(tokens.accessToken, secrets)).toBe(user.id);
    expect(await verifyRefreshToken(tokens.refreshToken, secrets)).toBe(
      user.id,
    );
  });

  it('matches the email case-insensitively', async () => {
    const { service } = await setup();
    await expect(
      service.login({ email: ' NICK@Example.com ', password: 'correct horse' }),
    ).resolves.toBeDefined();
  });

  it('rejects a wrong password with 401 INVALID_CREDENTIALS', async () => {
    const { service } = await setup();
    const login = service.login({
      email: 'nick@example.com',
      password: 'wrong horse',
    });
    await expect(login).rejects.toBeInstanceOf(AppError);
    await expect(login).rejects.toMatchObject(invalidCredentials);
  });

  it('rejects an unknown email exactly like a wrong password', async () => {
    const { service } = await setup();
    await expect(
      service.login({ email: 'nobody@example.com', password: 'correct horse' }),
    ).rejects.toMatchObject(invalidCredentials);
  });

  it('spends as long on an unknown email as on a wrong password', async () => {
    const { service } = await setup();
    const time = async (email: string) => {
      const started = performance.now();
      await service.login({ email, password: 'wrong horse' }).catch(() => {});
      return performance.now() - started;
    };
    await time('nobody@example.com'); // warm up
    const wrongPassword = await time('nick@example.com');
    const unknownEmail = await time('nobody@example.com');
    // Without a dummy hash an unknown email returns almost instantly.
    expect(unknownEmail).toBeGreaterThan(wrongPassword * 0.5);
  });
});

describe('auth service: refresh', () => {
  it('returns a new access token for a valid refresh token', async () => {
    const { user, service } = await setup();
    const { accessToken } = await service.refresh(
      await signRefreshToken(user.id, secrets),
    );
    expect(await verifyAccessToken(accessToken, secrets)).toBe(user.id);
  });

  it('rejects a missing refresh token', async () => {
    const { service } = await setup();
    await expect(service.refresh(undefined)).rejects.toMatchObject(
      invalidRefresh,
    );
  });

  it('rejects an invalid token, or an access token used as one', async () => {
    const { user, service } = await setup();
    await expect(service.refresh('not-a-jwt')).rejects.toMatchObject(
      invalidRefresh,
    );
    await expect(
      service.refresh(await signAccessToken(user.id, secrets)),
    ).rejects.toMatchObject(invalidRefresh);
  });

  it('rejects a refresh token whose user no longer exists', async () => {
    const { user, rows, service } = await setup();
    const token = await signRefreshToken(user.id, secrets);
    rows.splice(0, rows.length);
    await expect(service.refresh(token)).rejects.toMatchObject(invalidRefresh);
  });
});
