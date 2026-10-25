import { describe, expect, it } from 'vitest';
import { AppError } from '../../../shared/errors';
import { hashPassword } from '../../../shared/password';
import { createUsersService } from '../users.service';
import { fakeUsersRepository } from './fake-users-repository';

const input = {
  email: 'nick@example.com',
  firstName: 'Nick',
  lastName: 'Papas',
  password: 'correct horse',
};

describe('users service: register', () => {
  it('returns the new user without any password data', async () => {
    const { repository } = fakeUsersRepository();
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
    const { repository, rows } = fakeUsersRepository();
    await createUsersService({ repository }).register(input);
    const stored = rows[0]!;
    expect(JSON.stringify(stored)).not.toContain('correct horse');
    expect(
      (await hashPassword('correct horse', stored.passwordSalt)).hash,
    ).toBe(stored.passwordHash);
  });

  it('normalises the email to trimmed lower case', async () => {
    const { repository, rows } = fakeUsersRepository();
    await createUsersService({ repository }).register({
      ...input,
      email: ' Nick@Example.COM ',
    });
    expect(rows[0]!.email).toBe('nick@example.com');
  });

  it('rejects an email that is already registered, ignoring case, with 409', async () => {
    const { repository } = fakeUsersRepository();
    const service = createUsersService({ repository });
    await service.register(input);
    const duplicate = service.register({
      ...input,
      email: 'NICK@example.com',
    });
    await expect(duplicate).rejects.toBeInstanceOf(AppError);
    await expect(duplicate).rejects.toMatchObject({
      statusCode: 409,
      code: 'EMAIL_TAKEN',
      message: 'Email is already registered',
    });
  });
});
