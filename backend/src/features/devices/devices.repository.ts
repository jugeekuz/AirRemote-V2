import { devices, type Database, type Device } from '@airremote/db';
import { eq } from 'drizzle-orm';

export type DevicesRepository = {
  /** Any case; Postgres compares macaddr values, not text. */
  findByMacAddress(macAddress: string): Promise<Device | null>;
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
  };
}
