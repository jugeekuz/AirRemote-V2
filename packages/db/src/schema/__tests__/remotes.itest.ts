import { REMOTE_TYPES } from '@airremote/contracts';
import { eq, sql } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { useTestDatabase } from '../../../../../backend/src/__tests__/test-db';
import { devices, remotes, users, type NewRemote } from '../index';
import { rejection } from './pg-errors';

const testDb = useTestDatabase();

let deviceId: string;
let otherDeviceId: string;

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
  const [device, other] = await testDb.db
    .insert(devices)
    .values([
      { userId: user!.id, macAddress: 'aa:bb:cc:dd:ee:01', name: 'Hall' },
      { userId: user!.id, macAddress: 'aa:bb:cc:dd:ee:02', name: 'Bedroom' },
    ])
    .returning();
  deviceId = device!.id;
  otherDeviceId = other!.id;
});

const insertRemote = (values: Partial<NewRemote> = {}) =>
  testDb.db
    .insert(remotes)
    .values({ deviceId, name: 'Living room', type: 'smart_tv', ...values })
    .returning();

describe('remotes', () => {
  it('stores a remote with each type', async () => {
    for (const type of REMOTE_TYPES) {
      await insertRemote({ name: type, type });
    }
    const stored = await testDb.db.select().from(remotes);
    expect(stored.map((remote) => remote.type)).toEqual([...REMOTE_TYPES]);
  });

  it('rejects a type outside the list', async () => {
    expect(
      await rejection(
        testDb.db.execute(
          sql`insert into remotes (device_id, name, type) values (${deviceId}, 'TV', 'tv')`,
        ),
      ),
    ).toMatchObject({ code: '22P02' });
  });

  it('rejects a remote without a type', async () => {
    expect(
      await rejection(
        testDb.db.execute(
          sql`insert into remotes (device_id, name) values (${deviceId}, 'TV')`,
        ),
      ),
    ).toMatchObject({ code: '23502' });
  });

  it.each([
    ['Living room', 'living room'],
    ['Σαλόνι', 'σαλόνι'],
  ])(
    'rejects the same name in another case (%s, %s)',
    async (first, second) => {
      await insertRemote({ name: first });
      expect(await rejection(insertRemote({ name: second }))).toEqual({
        code: '23505',
        constraint: 'remotes_device_id_name_key',
      });
    },
  );

  it('accepts the same name on two devices', async () => {
    await insertRemote();
    await insertRemote({ deviceId: otherDeviceId });
    expect(await testDb.db.select().from(remotes)).toHaveLength(2);
  });

  it.each([' Power', 'Power ', '\tPower', 'Power\n'])(
    'rejects names with leading or trailing whitespace (%j)',
    async (name) => {
      expect(await rejection(insertRemote({ name }))).toEqual({
        code: '23514',
        constraint: 'remotes_name_check',
      });
    },
  );

  it('rejects an empty name and one over 100 characters', async () => {
    for (const name of ['', 'a'.repeat(101)]) {
      expect(await rejection(insertRemote({ name }))).toEqual({
        code: '23514',
        constraint: 'remotes_name_check',
      });
    }
    await insertRemote({ name: 'a'.repeat(100) });
  });

  it("deletes a device's remotes with it", async () => {
    await insertRemote();
    await testDb.db.delete(devices).where(eq(devices.id, deviceId));
    expect(await testDb.db.select().from(remotes)).toEqual([]);
  });
});
