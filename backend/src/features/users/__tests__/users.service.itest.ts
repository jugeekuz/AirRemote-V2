import { describe, expect, it } from 'vitest';
import { useTestDatabase } from '../../../__tests__/test-db';
import { AppError } from '../../../shared/errors';
import { hashPassword } from '../../../shared/password';
import { createUsersRepository } from '../users.repository';
import { createUsersService } from '../users.service';

const testDb = useTestDatabase();

const input = {
  email: 'Nick@Example.com',
  firstName: 'Nick',
  lastName: 'Papas',
  password: 'correct horse',
};

function service() {
  return createUsersService({
    repository: createUsersRepository(testDb.db),
  });
}

describe('users service: register (with a real database)', () => {
  it('persists the user with a normalised email and a matching salted hash', async () => {
    const registered = await service().register(input);
    const [row] = await testDb.db.query.users.findMany();
    expect(row).toMatchObject({
      id: registered.id,
      email: 'nick@example.com',
      firstName: 'Nick',
      lastName: 'Papas',
    });
    expect((await hashPassword('correct horse', row!.passwordSalt)).hash).toBe(
      row!.passwordHash,
    );
    expect(registered.createdAt).toBe(row!.createdAt.toISOString());
  });

  it('rejects the same email in a different case with 409', async () => {
    await service().register(input);
    const duplicate = service().register({
      ...input,
      email: 'NICK@example.COM',
    });
    await expect(duplicate).rejects.toBeInstanceOf(AppError);
    await expect(duplicate).rejects.toMatchObject({
      statusCode: 409,
      code: 'EMAIL_TAKEN',
    });
  });

  it('creates exactly one user when the same email registers simultaneously', async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => service().register(input)),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await testDb.db.query.users.findMany()).toHaveLength(1);
  });
});
