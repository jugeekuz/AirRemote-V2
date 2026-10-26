import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { useTestDatabase } from '../../../../../backend/src/__tests__/test-db';
import {
  deviceCommands,
  devices,
  users,
  type NewDeviceCommand,
} from '../index';
import { rejection } from './pg-errors';

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
    .values({ userId: user!.id, macAddress: 'aa:bb:cc:dd:ee:01', name: 'Hall' })
    .returning();
  deviceId = device!.id;
});

const insertCommand = (values: Partial<NewDeviceCommand> = {}) =>
  testDb.db
    .insert(deviceCommands)
    .values({
      deviceId,
      kind: 'learn_button',
      context: {
        remoteId: '00000000-0000-4000-8000-000000000001',
        name: 'Power',
      },
      expiresAt: new Date(Date.now() + 30_000),
      ...values,
    })
    .returning();

describe('device_commands', () => {
  it('stores a command as pending and unfinished by default', async () => {
    const [stored] = await insertCommand();
    expect(stored).toMatchObject({
      deviceId,
      kind: 'learn_button',
      status: 'pending',
      errorCode: null,
      resultId: null,
      connectionId: null,
      finishedAt: null,
    });
  });

  it('rejects a second pending command for the same device', async () => {
    await insertCommand();
    expect(await rejection(insertCommand())).toEqual({
      code: '23505',
      constraint: 'device_commands_one_pending_per_device',
    });
  });

  it('accepts a pending command beside a finished one', async () => {
    await insertCommand({ status: 'succeeded', finishedAt: new Date() });
    await insertCommand();
    await insertCommand({ status: 'succeeded', finishedAt: new Date() });
  });

  it('rejects a pending command with a finish time', async () => {
    expect(await rejection(insertCommand({ finishedAt: new Date() }))).toEqual({
      code: '23514',
      constraint: 'device_commands_finished_check',
    });
  });

  it('rejects a finished command without a finish time', async () => {
    expect(await rejection(insertCommand({ status: 'expired' }))).toEqual({
      code: '23514',
      constraint: 'device_commands_finished_check',
    });
  });

  it('rejects a failed command without an error code', async () => {
    expect(
      await rejection(
        insertCommand({ status: 'failed', finishedAt: new Date() }),
      ),
    ).toEqual({ code: '23514', constraint: 'device_commands_error_check' });
  });

  it('rejects an error code on a command that did not fail', async () => {
    expect(
      await rejection(
        insertCommand({
          status: 'succeeded',
          finishedAt: new Date(),
          errorCode: 'TIMEOUT',
        }),
      ),
    ).toEqual({ code: '23514', constraint: 'device_commands_error_check' });
  });

  it('accepts a failed command with an error code', async () => {
    await insertCommand({
      status: 'failed',
      finishedAt: new Date(),
      errorCode: 'TIMEOUT',
    });
  });

  it("deletes a device's commands with the device", async () => {
    await insertCommand();
    await testDb.db.delete(devices).where(eq(devices.id, deviceId));
    expect(await testDb.db.select().from(deviceCommands)).toEqual([]);
  });
});

describe('send_ir commands', () => {
  it('stores a send_ir command with a button context', async () => {
    const buttonId = '00000000-0000-4000-8000-000000000002';
    const [stored] = await insertCommand({
      kind: 'send_ir',
      context: { buttonId },
    });
    expect(stored).toMatchObject({ kind: 'send_ir', context: { buttonId } });
  });
});
