import { randomUUID } from 'node:crypto';
import {
  buttons,
  deviceCommands,
  devices,
  remotes,
  users,
} from '@airremote/db';
import { sql } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { useTestDatabase } from '../../../__tests__/test-db';
import { createDeviceCommandsRepository } from '../device-commands.repository';

const testDb = useTestDatabase();

const ttlMs = 20_000;
const timingsUs = [9000, 4500, 560, 1690, 560, 0, 65535];

let userId: string;
let otherUserId: string;
let deviceId: string;
let otherDeviceId: string;
let remoteId: string;

const repository = () => createDeviceCommandsRepository(testDb.db);

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
  const [remote] = await testDb.db
    .insert(remotes)
    .values({ deviceId, name: 'TV', type: 'smart_tv' })
    .returning();
  remoteId = remote!.id;
});

function create(name = 'Power', forDevice = deviceId) {
  return repository().create({
    deviceId: forDevice,
    kind: 'learn_button',
    context: { remoteId, name },
    ttlMs,
  });
}

/** A pending row whose expiry has already passed, written directly. */
async function insertOverduePending() {
  const [row] = await testDb.db
    .insert(deviceCommands)
    .values({
      deviceId,
      kind: 'learn_button',
      context: { remoteId, name: 'Power' },
      createdAt: sql`now() - interval '21 seconds'`,
      expiresAt: sql`now() - interval '1 second'`,
    })
    .returning();
  return row!;
}

async function row(id: string) {
  const [found] = await testDb.db
    .select()
    .from(deviceCommands)
    .where(sql`${deviceCommands.id} = ${id}`);
  return found!;
}

describe('device commands repository: create', () => {
  it('creates a pending command expiring ttl after now', async () => {
    const command = await create();
    expect(command).toMatchObject({
      deviceId,
      kind: 'learn_button',
      context: { remoteId, name: 'Power' },
      status: 'pending',
      errorCode: null,
      resultId: null,
      connectionId: null,
      finishedAt: null,
    });
    expect(
      command!.expiresAt.getTime() - command!.createdAt.getTime(),
    ).toBeCloseTo(ttlMs, -2);
  });

  it('refuses a second pending command for the device', async () => {
    expect(await create('Power')).not.toBeNull();
    expect(await create('Mute')).toBeNull();
    // Another device is not busy.
    expect(await create('Power', otherDeviceId)).not.toBeNull();
  });

  it("creating a command expires the device's overdue pending command", async () => {
    const overdue = await insertOverduePending();
    const command = await create();
    expect(command?.status).toBe('pending');
    const old = await row(overdue.id);
    expect(old.status).toBe('expired');
    expect(old.finishedAt).toBeInstanceOf(Date);
  });
});

describe('device commands repository: findForUser', () => {
  it('reads a pending command past its expiry as expired', async () => {
    const overdue = await insertOverduePending();
    const view = await repository().findForUser(overdue.id, userId);
    expect(view).toEqual({
      id: overdue.id,
      kind: 'learn_button',
      status: 'expired',
      errorCode: null,
      createdAt: overdue.createdAt,
      expiresAt: overdue.expiresAt,
      button: null,
    });
    // Reading does not write.
    expect((await row(overdue.id)).status).toBe('pending');
  });

  it('reads a pending command as pending', async () => {
    const command = await create();
    expect((await repository().findForUser(command!.id, userId))?.status).toBe(
      'pending',
    );
  });

  it('only the owner finds a command', async () => {
    const command = await create();
    expect(await repository().findForUser(command!.id, userId)).not.toBeNull();
    expect(await repository().findForUser(command!.id, otherUserId)).toBeNull();
    expect(await repository().findForUser(randomUUID(), userId)).toBeNull();
  });
});

describe('device commands repository: completeLearnButton', () => {
  it('completes a learn: saves the button with the timings and marks it succeeded', async () => {
    const command = await create();
    expect(
      await repository().completeLearnButton({
        id: command!.id,
        deviceId,
        timingsUs,
      }),
    ).toBe('succeeded');

    const saved = await testDb.db.select().from(buttons);
    expect(saved).toEqual([
      { id: expect.any(String), remoteId, name: 'Power', timingsUs },
    ]);

    const stored = await row(command!.id);
    expect(stored.status).toBe('succeeded');
    expect(stored.resultId).toBe(saved[0]!.id);
    expect(stored.finishedAt).toBeInstanceOf(Date);

    const view = await repository().findForUser(command!.id, userId);
    expect(view).toMatchObject({
      status: 'succeeded',
      errorCode: null,
      button: { id: saved[0]!.id, remoteId, name: 'Power' },
    });
  });

  it('a name taken meanwhile ends as failed BUTTON_NAME_TAKEN', async () => {
    const command = await create('Power');
    await testDb.db
      .insert(buttons)
      .values({ remoteId, name: 'power', timingsUs: [1, 2, 3] });

    expect(
      await repository().completeLearnButton({
        id: command!.id,
        deviceId,
        timingsUs,
      }),
    ).toBe('name-taken');

    const saved = await testDb.db.select().from(buttons);
    expect(saved.map((button) => button.name)).toEqual(['power']);

    const stored = await row(command!.id);
    expect(stored).toMatchObject({
      status: 'failed',
      errorCode: 'BUTTON_NAME_TAKEN',
      resultId: null,
    });
    expect(stored.finishedAt).toBeInstanceOf(Date);
    expect(await repository().findForUser(command!.id, userId)).toMatchObject({
      status: 'failed',
      errorCode: 'BUTTON_NAME_TAKEN',
      button: null,
    });
  });

  it('ignores a reply from another device, for an unknown id, or after expiry', async () => {
    const command = await create();
    const before = await row(command!.id);
    expect(
      await repository().completeLearnButton({
        id: command!.id,
        deviceId: otherDeviceId,
        timingsUs,
      }),
    ).toBe('not-pending');
    expect(
      await repository().completeLearnButton({
        id: randomUUID(),
        deviceId,
        timingsUs,
      }),
    ).toBe('not-pending');
    expect(await row(command!.id)).toEqual(before);

    await testDb.db.delete(deviceCommands);
    const overdue = await insertOverduePending();
    expect(
      await repository().completeLearnButton({
        id: overdue.id,
        deviceId,
        timingsUs,
      }),
    ).toBe('not-pending');
    expect(await row(overdue.id)).toEqual(overdue);
    expect(await testDb.db.select().from(buttons)).toEqual([]);
  });

  it('does not complete a command twice', async () => {
    const command = await create();
    const input = { id: command!.id, deviceId, timingsUs };
    expect(await repository().completeLearnButton(input)).toBe('succeeded');
    expect(await repository().completeLearnButton(input)).toBe('not-pending');
    expect(await testDb.db.select().from(buttons)).toHaveLength(1);
  });
});

describe('device commands repository: fail', () => {
  it('fails a command once; a second fail changes nothing', async () => {
    const command = await create();
    expect(
      await repository().fail({
        id: command!.id,
        deviceId,
        errorCode: 'LEARN_TIMEOUT',
      }),
    ).toBe(true);
    const failed = await row(command!.id);
    expect(failed).toMatchObject({
      status: 'failed',
      errorCode: 'LEARN_TIMEOUT',
    });
    expect(failed.finishedAt).toBeInstanceOf(Date);

    expect(
      await repository().fail({
        id: command!.id,
        deviceId,
        errorCode: 'OTHER',
      }),
    ).toBe(false);
    expect(await row(command!.id)).toEqual(failed);
  });

  it('ignores another device, an unknown id, and an expired command', async () => {
    const command = await create();
    expect(
      await repository().fail({
        id: command!.id,
        deviceId: otherDeviceId,
        errorCode: 'X',
      }),
    ).toBe(false);
    expect(
      await repository().fail({ id: randomUUID(), deviceId, errorCode: 'X' }),
    ).toBe(false);
    expect((await row(command!.id)).status).toBe('pending');

    await testDb.db.delete(deviceCommands);
    const overdue = await insertOverduePending();
    expect(
      await repository().fail({ id: overdue.id, deviceId, errorCode: 'X' }),
    ).toBe(false);
    expect(await row(overdue.id)).toEqual(overdue);
  });
});

describe('device commands repository: connections', () => {
  it("a connection's close fails only the commands sent over it", async () => {
    const oldConnection = randomUUID();
    const newConnection = randomUUID();
    const command = await create();
    await repository().recordConnection(command!.id, newConnection);
    expect((await row(command!.id)).connectionId).toBe(newConnection);

    expect(
      await repository().failConnection({
        deviceId,
        connectionId: oldConnection,
        errorCode: 'DEVICE_DISCONNECTED',
      }),
    ).toBe(0);
    expect((await row(command!.id)).status).toBe('pending');

    expect(
      await repository().failConnection({
        deviceId,
        connectionId: newConnection,
        errorCode: 'DEVICE_DISCONNECTED',
      }),
    ).toBe(1);
    const failed = await row(command!.id);
    expect(failed).toMatchObject({
      status: 'failed',
      errorCode: 'DEVICE_DISCONNECTED',
    });
    expect(failed.finishedAt).toBeInstanceOf(Date);
  });
});
