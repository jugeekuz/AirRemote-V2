import { devices, users } from '@airremote/db';
import { beforeEach, describe, expect, it } from 'vitest';
import { useTestDatabase } from '../../../__tests__/test-db';
import { createDevicesRepository } from '../devices.repository';

const testDb = useTestDatabase();

let deviceId: string;

beforeEach(async () => {
  const [user] = await testDb.db
    .insert(users)
    .values({
      email: 'nick@example.com',
      firstName: 'Nick',
      lastName: 'Papas',
      passwordHash: 'hash',
      passwordSalt: 'salt',
    })
    .returning();
  const [device] = await testDb.db
    .insert(devices)
    .values({
      userId: user!.id,
      macAddress: 'aa:bb:cc:dd:ee:01',
      name: 'Living room',
    })
    .returning();
  deviceId = device!.id;
});

describe('devices repository: findByMacAddress', () => {
  it('finds a device by MAC address', async () => {
    const found = await createDevicesRepository(testDb.db).findByMacAddress(
      'aa:bb:cc:dd:ee:01',
    );
    expect(found?.id).toBe(deviceId);
  });

  it('matches a MAC given in a different case', async () => {
    const found = await createDevicesRepository(testDb.db).findByMacAddress(
      'AA:BB:CC:DD:EE:01',
    );
    expect(found?.id).toBe(deviceId);
  });

  it('returns null for an unknown MAC', async () => {
    expect(
      await createDevicesRepository(testDb.db).findByMacAddress(
        'aa:bb:cc:dd:ee:02',
      ),
    ).toBeNull();
  });
});
