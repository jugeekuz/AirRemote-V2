import {
  devices,
  pairingCodes,
  type Database,
  type Device,
  type NewPairingCode,
} from '@airremote/db';
import { and, asc, eq, gt, sql, TransactionRollbackError } from 'drizzle-orm';

export type EnrollResult =
  | { status: 'enrolled'; device: Device }
  | { status: 'invalid-code' }
  | { status: 'already-registered' };

export type DevicesRepository = {
  /** Any case; Postgres compares macaddr values, not text. */
  findByMacAddress(macAddress: string): Promise<Device | null>;
  /** The user's devices, by name ignoring case, then id. */
  listForUser(userId: string): Promise<Device[]>;
  /** Stores the device's pairing code, replacing any previous one. */
  savePairingCode(code: NewPairingCode): Promise<void>;
  /**
   * Consumes a live pairing code and creates the device, in one transaction:
   * when the device cannot be created, the code is left unused.
   */
  /** A device deleted in the meantime is a no-op. */
  setFirmwareVersion(deviceId: string, firmwareVersion: string): Promise<void>;
  enroll(input: {
    macAddress: string;
    codeHash: string;
    now: Date;
    userId: string;
    name: string;
  }): Promise<EnrollResult>;
};

export function createDevicesRepository(db: Database): DevicesRepository {
  return {
    async findByMacAddress(macAddress) {
      const [device] = await db
        .select()
        .from(devices)
        .where(eq(devices.macAddress, macAddress));
      return device ?? null;
    },

    async listForUser(userId) {
      return db
        .select()
        .from(devices)
        .where(eq(devices.userId, userId))
        .orderBy(asc(sql`lower(${devices.name})`), asc(devices.id));
    },

    async savePairingCode(code) {
      await db
        .insert(pairingCodes)
        .values(code)
        .onConflictDoUpdate({
          target: pairingCodes.macAddress,
          set: { codeHash: code.codeHash, expiresAt: code.expiresAt },
        });
    },

    async setFirmwareVersion(deviceId, firmwareVersion) {
      await db
        .update(devices)
        .set({ firmwareVersion })
        .where(eq(devices.id, deviceId));
    },

    async enroll({ macAddress, codeHash, now, userId, name }) {
      try {
        return await db.transaction(async (tx) => {
          // Deleting the row claims it: a concurrent enrollment waits on the
          // row lock, then finds nothing to delete.
          const [code] = await tx
            .delete(pairingCodes)
            .where(
              and(
                eq(pairingCodes.macAddress, macAddress),
                eq(pairingCodes.codeHash, codeHash),
                gt(pairingCodes.expiresAt, now),
              ),
            )
            .returning();
          if (!code) return { status: 'invalid-code' } as const;

          const [device] = await tx
            .insert(devices)
            .values({ userId, macAddress, name })
            .onConflictDoNothing({ target: devices.macAddress })
            .returning();
          if (!device) return tx.rollback();
          return { status: 'enrolled', device } as const;
        });
      } catch (error) {
        if (error instanceof TransactionRollbackError) {
          return { status: 'already-registered' };
        }
        throw error;
      }
    },
  };
}
