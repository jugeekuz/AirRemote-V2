import type { NewUser, User } from '@airremote/db';
import { describe, expect, it } from 'vitest';
import { AppError } from '../../../shared/errors';
import { hashPassword } from '../users.helpers';
import type { UsersRepository } from '../users.repository';
import { createUsersService } from '../users.service';

const input = {
  email: 'nick@example.com',
  firstName: 'Nick',
  lastName: 'Papas',
  password: 'correct horse',
};

/** An in-memory repository that, like the real one, refuses a duplicate email. */
function fakeRepository() {
  const rows: User[] = [];
  const repository: UsersRepository = {
    async create(user: NewUser) {
      if (rows.some((row) => row.email === user.email)) return null;
      const now = new Date('2026-10-25T12:00:00.000Z');
      const row: User = {
        id: '6f1c2a52-3c1e-4a8e-9a43-0d5f1f6f2b11',
        createdAt: now,
        updatedAt: now,
        ...user,
      } as User;
      rows.push(row);
      return row;
    },
  };
  return { repository, rows };
}

describe('users service: register', () => {
  it('returns the new user without any password data', async () => {
    const { repository } = fakeRepository();
    const user = await createUsersService({ repository }).register(input);
    expect(user).toEqual({
      id: '6f1c2a52-3c1e-4a8e-9a43-0d5f1f6f2b11',
      email: 'nick@example.com',
      firstName: 'Nick',
      lastName: 'Papas',
      createdAt: '2026-10-25T12:00:00.000Z',
    });
  });

  it('stores a salted hash that matches the password, never the password', async () => {
    const { repository, rows } = fakeRepository();
    await createUsersService({ repository }).register(input);
    const stored = rows[0]!;
    expect(JSON.stringify(stored)).not.toContain('correct horse');
    expect(
      (await hashPassword('correct horse', stored.passwordSalt)).hash,
    ).toBe(stored.passwordHash);
  });

  it('normalises the email to trimmed lower case', async () => {
    const { repository, rows } = fakeRepository();
    await createUsersService({ repository }).register({
      ...input,
      email: ' Nick@Example.COM ',
    });
    expect(rows[0]!.email).toBe('nick@example.com');
  });

  it('rejects an email that is already registered, ignoring case, with 409', async () => {
    const { repository } = fakeRepository();
    const service = createUsersService({ repository });
    await service.register(input);
    const duplicate = service.register({
      ...input,
      email: 'NICK@example.com',
    });
    await expect(duplicate).rejects.toBeInstanceOf(AppError);
    await expect(duplicate).rejects.toMatchObject({
      statusCode: 409,
      message: 'Email is already registered',
    });
  });
});
