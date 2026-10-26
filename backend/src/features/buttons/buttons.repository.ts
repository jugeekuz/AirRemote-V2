import { buttons, devices, remotes, type Database } from '@airremote/db';
import { and, asc, eq, sql } from 'drizzle-orm';

export type ButtonsRepository = {
  /** The remote and its device, if the device is the user's. */
  findOwnedRemote(
    remoteId: string,
    userId: string,
  ): Promise<{ id: string; deviceId: string } | null>;
  /** The remote's buttons, without their IR timings, by name ignoring case. */
  listForRemote(
    remoteId: string,
  ): Promise<{ id: string; remoteId: string; name: string }[]>;
  /** Whether the remote has a button with this name, ignoring case. */
  nameTaken(remoteId: string, name: string): Promise<boolean>;
};

export function createButtonsRepository(db: Database): ButtonsRepository {
  return {
    async findOwnedRemote(remoteId, userId) {
      const [remote] = await db
        .select({ id: remotes.id, deviceId: remotes.deviceId })
        .from(remotes)
        .innerJoin(devices, eq(devices.id, remotes.deviceId))
        .where(and(eq(remotes.id, remoteId), eq(devices.userId, userId)));
      return remote ?? null;
    },

    async listForRemote(remoteId) {
      return db
        .select({
          id: buttons.id,
          remoteId: buttons.remoteId,
          name: buttons.name,
        })
        .from(buttons)
        .where(eq(buttons.remoteId, remoteId))
        .orderBy(asc(sql`lower(${buttons.name})`), asc(buttons.id));
    },

    async nameTaken(remoteId, name) {
      // The same comparison as the buttons_remote_id_name_key index.
      const [taken] = await db
        .select({ id: buttons.id })
        .from(buttons)
        .where(
          and(
            eq(buttons.remoteId, remoteId),
            sql`lower(${buttons.name}) = lower(${name})`,
          ),
        )
        .limit(1);
      return taken !== undefined;
    },
  };
}
