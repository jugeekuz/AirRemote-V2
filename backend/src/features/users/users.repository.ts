import { users, type Database, type NewUser, type User } from '@airremote/db';
import { eq } from 'drizzle-orm';

export type UsersRepository = {
  /** Inserts a user. Returns null when the email is already registered. */
  create(user: NewUser): Promise<User | null>;
  /** Expects an already normalised (trimmed, lower-case) email. */
  findByEmail(email: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
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

    async findByEmail(email) {
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.email, email));
      return user ?? null;
    },

    async findById(id) {
      const [user] = await db.select().from(users).where(eq(users.id, id));
      return user ?? null;
    },
  };
}
