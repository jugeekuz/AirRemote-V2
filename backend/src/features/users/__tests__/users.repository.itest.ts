import { describe, expect, it } from 'vitest';
import { useTestDatabase } from '../../../__tests__/test-db';
import { createUsersRepository } from '../users.repository';

const testDb = useTestDatabase();

const newUser = {
  email: 'nick@example.com',
  firstName: 'Nick',
  lastName: 'Papas',
  passwordHash: 'hash',
  passwordSalt: 'salt',
};

describe('users repository: create', () => {
  it('inserts a user and returns the stored row', async () => {
    const created = await createUsersRepository(testDb.db).create(newUser);
    expect(created).toMatchObject(newUser);
    expect(created?.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(created?.createdAt).toBeInstanceOf(Date);
    expect(created?.updatedAt).toEqual(created?.createdAt);
  });

  it('returns null, and keeps the first user, when the email is taken', async () => {
    const repository = createUsersRepository(testDb.db);
    const first = await repository.create(newUser);
    const second = await repository.create({ ...newUser, firstName: 'Other' });
    expect(second).toBeNull();
    const rows = await testDb.db.query.users.findMany();
    expect(rows).toEqual([first]);
  });
});
