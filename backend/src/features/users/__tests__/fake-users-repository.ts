import type { NewUser, User } from '@airremote/db';
import type { UsersRepository } from '../users.repository';

/** An in-memory UsersRepository that, like the real one, refuses a duplicate email. */
export function fakeUsersRepository() {
  const rows: User[] = [];
  const repository: UsersRepository = {
    async create(user: NewUser) {
      if (rows.some((row) => row.email === user.email)) return null;
      const now = new Date('2026-10-25T12:00:00.000Z');
      const row = {
        // First user gets ...2b11, the next ...2b12, and so on.
        id: `6f1c2a52-3c1e-4a8e-9a43-0d5f1f6f2b1${rows.length + 1}`,
        createdAt: now,
        updatedAt: now,
        ...user,
      } as User;
      rows.push(row);
      return row;
    },
    async findByEmail(email) {
      return rows.find((row) => row.email === email) ?? null;
    },
    async findById(id) {
      return rows.find((row) => row.id === id) ?? null;
    },
  };
  return { repository, rows };
}
