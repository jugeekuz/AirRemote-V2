import { users } from '@airremote/db';
import { describe, expect, it } from 'vitest';
import { useTestDatabase } from '../../../__tests__/test-db';
import { createUsersRepository } from '../../users/users.repository';
import { createUsersService } from '../../users/users.service';
import { verifyAccessToken } from '../auth.helpers';
import { createAuthService } from '../auth.service';

const testDb = useTestDatabase();

const secrets = {
  accessSecret: 'test-access-secret-0123456789abcdef',
  refreshSecret: 'test-refresh-secret-0123456789abcdef',
};

function services() {
  const repository = createUsersRepository(testDb.db);
  return {
    users: createUsersService({ repository }),
    auth: createAuthService({ users: repository, secrets }),
  };
}

async function registerNick() {
  return services().users.register({
    email: 'Nick@Example.com',
    firstName: 'Nick',
    lastName: 'Papas',
    password: 'correct horse',
  });
}

describe('auth service (with a real database)', () => {
  it('logs in a registered user and refreshes their access token', async () => {
    const nick = await registerNick();
    const { auth } = services();

    const tokens = await auth.login({
      email: 'nick@EXAMPLE.com',
      password: 'correct horse',
    });
    expect(await verifyAccessToken(tokens.accessToken, secrets)).toBe(nick.id);

    const { accessToken } = await auth.refresh(tokens.refreshToken);
    expect(await verifyAccessToken(accessToken, secrets)).toBe(nick.id);
  });

  it('rejects a wrong password', async () => {
    await registerNick();
    await expect(
      services().auth.login({
        email: 'nick@example.com',
        password: 'wrong horse',
      }),
    ).rejects.toMatchObject({ statusCode: 401, code: 'INVALID_CREDENTIALS' });
  });

  it('stops refreshing once the user is deleted', async () => {
    await registerNick();
    const { auth } = services();
    const { refreshToken } = await auth.login({
      email: 'nick@example.com',
      password: 'correct horse',
    });
    await testDb.db.delete(users);
    await expect(auth.refresh(refreshToken)).rejects.toMatchObject({
      statusCode: 401,
      code: 'INVALID_REFRESH_TOKEN',
    });
  });
});
