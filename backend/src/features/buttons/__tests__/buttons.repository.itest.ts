import { buttons, devices, remotes, users } from '@airremote/db';
import { beforeEach, describe, expect, it } from 'vitest';
import { useTestDatabase } from '../../../__tests__/test-db';
import { createButtonsRepository } from '../buttons.repository';

const testDb = useTestDatabase();

let userId: string;
let deviceId: string;
let remoteId: string;
let otherRemoteId: string;
let otherUsersRemoteId: string;

const repository = () => createButtonsRepository(testDb.db);

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

async function insertRemote(onDevice: string, name: string) {
  const [remote] = await testDb.db
    .insert(remotes)
    .values({ deviceId: onDevice, name, type: 'smart_tv' })
    .returning();
  return remote!.id;
}

beforeEach(async () => {
  userId = await insertUser('nick@example.com');
  const otherUserId = await insertUser('maria@example.com');
  deviceId = await insertDevice(userId, 'aa:bb:cc:dd:ee:01');
  const otherDeviceId = await insertDevice(otherUserId, 'aa:bb:cc:dd:ee:02');
  remoteId = await insertRemote(deviceId, 'TV');
  otherRemoteId = await insertRemote(deviceId, 'Heater');
  otherUsersRemoteId = await insertRemote(otherDeviceId, 'TV');
  await testDb.db
    .insert(buttons)
    .values({ remoteId, name: 'Power', timingsUs: [9000, 4500] });
});

describe('buttons repository: findOwnedRemote', () => {
  it('finds the user’s remote with its device', async () => {
    await expect(
      repository().findOwnedRemote(remoteId, userId),
    ).resolves.toEqual({ id: remoteId, deviceId });
  });

  it('does not find a remote on another user’s device', async () => {
    await expect(
      repository().findOwnedRemote(otherUsersRemoteId, userId),
    ).resolves.toBeNull();
  });

  it('does not find a remote that does not exist', async () => {
    await expect(
      repository().findOwnedRemote(
        '00000000-0000-4000-8000-000000000000',
        userId,
      ),
    ).resolves.toBeNull();
  });
});

describe('buttons repository: nameTaken', () => {
  it.each(['Power', 'power', 'POWER'])(
    'is true for %s on the remote that has Power',
    async (name) => {
      await expect(repository().nameTaken(remoteId, name)).resolves.toBe(true);
    },
  );

  it('is false for another name', async () => {
    await expect(repository().nameTaken(remoteId, 'Mute')).resolves.toBe(false);
  });

  it('is false on another remote', async () => {
    await expect(repository().nameTaken(otherRemoteId, 'Power')).resolves.toBe(
      false,
    );
  });
});

describe('buttons repository: listForRemote', () => {
  it('returns only the remote’s buttons, by name ignoring case, then id, without timings', async () => {
    const [b, a, c] = await testDb.db
      .insert(buttons)
      .values([
        { remoteId: otherRemoteId, name: 'b', timingsUs: [1, 2] },
        { remoteId: otherRemoteId, name: 'A', timingsUs: [3, 4] },
        { remoteId: otherRemoteId, name: 'c', timingsUs: [5, 6] },
      ])
      .returning();

    const listed = await repository().listForRemote(otherRemoteId);
    expect(listed).toEqual(
      [a, b, c].map((button) => ({
        id: button!.id,
        remoteId: otherRemoteId,
        name: button!.name,
      })),
    );
    for (const button of listed) expect(button).not.toHaveProperty('timingsUs');
  });

  it('returns an empty list for a remote without buttons', async () => {
    await expect(repository().listForRemote(otherRemoteId)).resolves.toEqual(
      [],
    );
  });
});
