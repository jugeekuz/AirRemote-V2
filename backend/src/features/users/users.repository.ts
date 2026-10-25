import { users, type Database, type NewUser, type User } from '@airremote/db';

export type UsersRepository = {
  /** Inserts a user. Returns null when the email is already registered. */
  create(user: NewUser): Promise<User | null>;
};

export function createUsersRepository(db: Database): UsersRepository {
  return {
    async create(user) {
      // Lets the unique constraint decide, so simultaneous sign-ups cannot both win.
      const [created] = await db
        .insert(users)
        .values(user)
        .onConflictDoNothing({ target: users.email })
        .returning();
      return created ?? null;
    },
  };
}
