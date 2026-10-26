import {
  devices,
  remotes,
  type Database,
  type NewRemote,
  type Remote,
} from '@airremote/db';
import { and, asc, eq, sql } from 'drizzle-orm';
import { isUniqueViolation } from '../../shared/pg-errors';

export type RemotesRepository = {
  /** The device, if it is the user's. */
  findOwnedDevice(
    deviceId: string,
    userId: string,
  ): Promise<{ id: string } | null>;
  /** Remotes on the user's devices, by name ignoring case, then id. */
  listForUser(userId: string): Promise<Remote[]>;
  /** Null when the device already has a remote with that name, ignoring case. */
  create(remote: Omit<NewRemote, 'id'>): Promise<Remote | null>;
};

const NAME_KEY = 'remotes_device_id_name_key';

export function createRemotesRepository(db: Database): RemotesRepository {
  return {
    async findOwnedDevice(deviceId, userId) {
      const [device] = await db
        .select({ id: devices.id })
        .from(devices)
        .where(and(eq(devices.id, deviceId), eq(devices.userId, userId)));
      return device ?? null;
    },

    async listForUser(userId) {
      const rows = await db
        .select({ remote: remotes })
        .from(remotes)
        .innerJoin(devices, eq(devices.id, remotes.deviceId))
        .where(eq(devices.userId, userId))
        .orderBy(asc(sql`lower(${remotes.name})`), asc(remotes.id));
      return rows.map((row) => row.remote);
    },

    async create({ deviceId, name, type }) {
      try {
        const [remote] = await db
          .insert(remotes)
          .values({ deviceId, name, type })
          .returning();
        return remote!;
      } catch (error) {
        // The unique index decides, so two concurrent requests cannot both win.
        if (isUniqueViolation(error, NAME_KEY)) return null;
        throw error;
      }
    },
  };
}
