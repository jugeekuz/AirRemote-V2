import { eq, sql } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { useTestDatabase } from '../../../../../backend/src/__tests__/test-db';
import { buttons, devices, remotes, users, type NewButton } from '../index';
import { rejection } from './pg-errors';

const testDb = useTestDatabase();

let deviceId: string;
let remoteId: string;
let otherRemoteId: string;

const timings = [9000, 4500, 560, 1690, 0, 65535];

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
  const [remote, other] = await testDb.db
    .insert(remotes)
    .values([
      { deviceId, name: 'TV', type: 'smart_tv' },
      { deviceId, name: 'AC', type: 'air_conditioner' },
    ])
    .returning();
  remoteId = remote!.id;
  otherRemoteId = other!.id;
});

const insertButton = (values: Partial<NewButton> = {}) =>
  testDb.db
    .insert(buttons)
    .values({ remoteId, name: 'Power', timingsUs: timings, ...values })
    .returning();

/** Inserts a button whose timings are given as SQL, for values Drizzle's types refuse. */
const insertRawTimings = (timingsSql: string) =>
  testDb.db.execute(
    sql`insert into buttons (remote_id, name, timings_us) values (${remoteId}, 'Power', ${sql.raw(timingsSql)})`,
  );

describe('buttons', () => {
  it('stores a button and reads its timings back intact', async () => {
    await insertButton();
    const [stored] = await testDb.db.select().from(buttons);
    expect(stored).toMatchObject({
      remoteId,
      name: 'Power',
      timingsUs: timings,
    });
  });

  it('rejects the same name in another case within a remote; accepts it on another remote', async () => {
    await insertButton();
    expect(await rejection(insertButton({ name: 'POWER' }))).toEqual({
      code: '23505',
      constraint: 'buttons_remote_id_name_key',
    });
    await insertButton({ name: 'power', remoteId: otherRemoteId });
  });

  it.each([
    ' Power',
    'Power ',
    '\tPower',
    'Power\n',
    '\u00a0Power',
    'Power\u00a0',
    'Power\u2007',
    'Power\u202f',
    '\ufeffPower',
  ])('rejects names with leading or trailing whitespace (%j)', async (name) => {
    expect(await rejection(insertButton({ name }))).toEqual({
      code: '23514',
      constraint: 'buttons_name_check',
    });
  });

  it('rejects an empty name and one over 100 characters', async () => {
    for (const name of ['', 'a'.repeat(101)]) {
      expect(await rejection(insertButton({ name }))).toEqual({
        code: '23514',
        constraint: 'buttons_name_check',
      });
    }
    await insertButton({ name: 'a'.repeat(100) });
  });

  it('rejects a button without timings', async () => {
    expect(await rejection(insertRawTimings('NULL'))).toMatchObject({
      code: '23502',
    });
  });

  it.each([
    ['an empty array', "'{}'::integer[]"],
    ['2049 entries', 'array_fill(1, ARRAY[2049])'],
    ['two dimensions', "'{{1,2},{3,4}}'::integer[]"],
    ['a NULL entry', 'ARRAY[1, NULL]::integer[]'],
  ])('rejects the timings shape: %s', async (_case, value) => {
    expect(await rejection(insertRawTimings(value))).toEqual({
      code: '23514',
      constraint: 'buttons_timings_us_shape_check',
    });
  });

  it.each([[[1, 65536]], [[-1, 1]]])(
    'rejects timings out of range: %j',
    async (timingsUs) => {
      expect(await rejection(insertButton({ timingsUs }))).toEqual({
        code: '23514',
        constraint: 'buttons_timings_us_range_check',
      });
    },
  );

  it('accepts exactly 2048 entries', async () => {
    const timingsUs = Array.from({ length: 2048 }, (_, i) => i % 65536);
    await insertButton({ timingsUs });
    const [stored] = await testDb.db.select().from(buttons);
    expect(stored?.timingsUs).toEqual(timingsUs);
  });

  it("deletes a remote's buttons with it", async () => {
    await insertButton();
    await testDb.db.delete(remotes).where(eq(remotes.id, remoteId));
    expect(await testDb.db.select().from(buttons)).toEqual([]);
  });

  it("deletes a device's remotes' buttons with the device", async () => {
    await insertButton();
    await insertButton({ remoteId: otherRemoteId });
    await testDb.db.delete(devices).where(eq(devices.id, deviceId));
    expect(await testDb.db.select().from(buttons)).toEqual([]);
  });
});
