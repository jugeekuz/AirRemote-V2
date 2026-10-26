import {
  devices,
  remotes,
  type Database,
  type NewRemote,
  type Remote,
} from '@airremote/db';
import { and, eq } from 'drizzle-orm';
import { isUniqueViolation } from '../../shared/pg-errors';

export type RemotesRepository = {
  /** The device, if it is the user's. */
  findOwnedDevice(
    deviceId: string,
    userId: string,
  ): Promise<{ id: string } | null>;
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
