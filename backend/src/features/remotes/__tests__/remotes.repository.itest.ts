import { devices, remotes, users } from '@airremote/db';
import { beforeEach, describe, expect, it } from 'vitest';
import { useTestDatabase } from '../../../__tests__/test-db';
import { createRemotesRepository } from '../remotes.repository';

const testDb = useTestDatabase();

let userId: string;
let otherUserId: string;
let deviceId: string;
let otherDeviceId: string;

const repository = () => createRemotesRepository(testDb.db);

async function insertUser(email: string) {
  const [user] = await testDb.db
    .insert(users)
    .values({
      email,
      firstName: 'Nick',
      lastName: 'Papas',
      passwordHash: 'hash',
      passwordSalt: 'salt',
    })
    .returning();
  return user!.id;
}

async function insertDevice(ownerId: string, macAddress: string) {
  const [device] = await testDb.db
    .insert(devices)
    .values({ userId: ownerId, macAddress, name: 'Living room' })
    .returning();
  return device!.id;
}

beforeEach(async () => {
  userId = await insertUser('nick@example.com');
  otherUserId = await insertUser('maria@example.com');
  deviceId = await insertDevice(userId, 'aa:bb:cc:dd:ee:01');
  otherDeviceId = await insertDevice(otherUserId, 'aa:bb:cc:dd:ee:02');
});

describe('remotes repository: findOwnedDevice', () => {
  it('finds the user’s device', async () => {
    await expect(
      repository().findOwnedDevice(deviceId, userId),
    ).resolves.toEqual({ id: deviceId });
  });

  it('does not find another user’s device', async () => {
    await expect(
      repository().findOwnedDevice(otherDeviceId, userId),
    ).resolves.toBeNull();
  });

  it('does not find a device that does not exist', async () => {
    await expect(
      repository().findOwnedDevice(
        '00000000-0000-4000-8000-000000000000',
        userId,
      ),
    ).resolves.toBeNull();
  });
});

describe('remotes repository: create', () => {
  it('creates the remote', async () => {
    const remote = await repository().create({
      deviceId,
      name: 'Living room TV',
      type: 'smart_tv',
    });

    expect(remote).toEqual({
      id: expect.any(String),
      deviceId,
      name: 'Living room TV',
      type: 'smart_tv',
    });
    await expect(testDb.db.select().from(remotes)).resolves.toEqual([remote]);
  });

  it('returns null for a name used on the device, ignoring case', async () => {
    await repository().create({ deviceId, name: 'TV', type: 'smart_tv' });

    await expect(
      repository().create({ deviceId, name: 'tv', type: 'heater' }),
    ).resolves.toBeNull();
    await expect(testDb.db.select().from(remotes)).resolves.toHaveLength(1);
  });

  it('allows the same name on another device', async () => {
    await repository().create({ deviceId, name: 'TV', type: 'smart_tv' });

    await expect(
      repository().create({
        deviceId: otherDeviceId,
        name: 'TV',
        type: 'smart_tv',
      }),
    ).resolves.toMatchObject({ deviceId: otherDeviceId, name: 'TV' });
  });

  it('rethrows any other database error', async () => {
    await expect(
      repository().create({ deviceId, name: ' TV', type: 'smart_tv' }),
    ).rejects.toThrow();
  });
});

describe('remotes repository: listForUser', () => {
  it('returns only remotes on the user’s devices, by name ignoring case, then id', async () => {
    const secondDeviceId = await insertDevice(userId, 'aa:bb:cc:dd:ee:03');
    const [b, a, c] = await testDb.db
      .insert(remotes)
      .values([
        { deviceId, name: 'b', type: 'smart_tv' },
        { deviceId: secondDeviceId, name: 'A', type: 'heater' },
        { deviceId, name: 'c', type: 'smart_tv' },
      ])
      .returning();
    await testDb.db
      .insert(remotes)
      .values({ deviceId: otherDeviceId, name: 'a', type: 'smart_tv' });

    await expect(repository().listForUser(userId)).resolves.toEqual([a, b, c]);
  });

  it('breaks a tie on name by id', async () => {
    const secondDeviceId = await insertDevice(userId, 'aa:bb:cc:dd:ee:03');
    const inserted = await testDb.db
      .insert(remotes)
      .values([
        { deviceId, name: 'Same', type: 'smart_tv' },
        { deviceId: secondDeviceId, name: 'same', type: 'smart_tv' },
      ])
      .returning();

    const listed = await repository().listForUser(userId);
    expect(listed.map((r) => r.id)).toEqual(inserted.map((r) => r.id).sort());
  });

  it('returns an empty list for a user without remotes', async () => {
    await expect(repository().listForUser(userId)).resolves.toEqual([]);
  });
});
