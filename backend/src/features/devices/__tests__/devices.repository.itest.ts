import { devices, pairingCodes, users } from '@airremote/db';
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

describe('devices repository: listForUser', () => {
  it('returns only the user’s devices, by name ignoring case, then id', async () => {
    const ownerId = await insertUser('list@example.com');
    const otherId = await insertUser('other@example.com');
    const [b, a, c] = await testDb.db
      .insert(devices)
      .values([
        { userId: ownerId, macAddress: 'aa:bb:cc:dd:ee:11', name: 'b' },
        { userId: ownerId, macAddress: 'aa:bb:cc:dd:ee:12', name: 'A' },
        { userId: ownerId, macAddress: 'aa:bb:cc:dd:ee:13', name: 'c' },
      ])
      .returning();
    await testDb.db
      .insert(devices)
      .values({ userId: otherId, macAddress: 'aa:bb:cc:dd:ee:14', name: 'a' });

    const listed = await createDevicesRepository(testDb.db).listForUser(
      ownerId,
    );
    expect(listed).toEqual([a, b, c]);
  });

  it('breaks a tie on name by id', async () => {
    const ownerId = await insertUser('tie@example.com');
    const inserted = await testDb.db
      .insert(devices)
      .values([
        { userId: ownerId, macAddress: 'aa:bb:cc:dd:ee:21', name: 'Same' },
        { userId: ownerId, macAddress: 'aa:bb:cc:dd:ee:22', name: 'same' },
      ])
      .returning();

    const listed = await createDevicesRepository(testDb.db).listForUser(
      ownerId,
    );
    expect(listed.map((d) => d.id)).toEqual(inserted.map((d) => d.id).sort());
  });

  it('returns an empty list for a user without devices', async () => {
    const ownerId = await insertUser('empty@example.com');
    await expect(
      createDevicesRepository(testDb.db).listForUser(ownerId),
    ).resolves.toEqual([]);
  });
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

describe('devices repository: pairing and enrollment', () => {
  const now = new Date('2026-10-26T12:00:00Z');
  const inFifteenMinutes = new Date('2026-10-26T12:15:00Z');
  const newMac = 'aa:bb:cc:dd:ee:02';

  const repository = () => createDevicesRepository(testDb.db);

  async function insertUser(email: string) {
    const [user] = await testDb.db
      .insert(users)
      .values({
        email,
        firstName: 'Maria',
        lastName: 'Kosta',
        passwordHash: 'hash',
        passwordSalt: 'salt',
      })
      .returning();
    return user!.id;
  }

  function saveCode(
    codeHash: string,
    macAddress = newMac,
    expiresAt = inFifteenMinutes,
  ) {
    return repository().savePairingCode({ macAddress, codeHash, expiresAt });
  }

  function enroll(codeHash: string, userId: string, macAddress = newMac) {
    return repository().enroll({
      macAddress,
      codeHash,
      now,
      userId,
      name: 'Bedroom',
    });
  }

  let userId: string;

  beforeEach(async () => {
    userId = await insertUser('maria@example.com');
  });

  it('replaces the previous code for the same MAC', async () => {
    await saveCode('h1');
    await saveCode('h2');
    expect(await enroll('h1', userId)).toEqual({ status: 'invalid-code' });
    expect((await enroll('h2', userId)).status).toBe('enrolled');
  });

  it('enrolls with a valid code and consumes it', async () => {
    await saveCode('h1');
    const result = await enroll('h1', userId);
    expect(result).toEqual({
      status: 'enrolled',
      device: expect.objectContaining({
        userId,
        name: 'Bedroom',
        macAddress: 'aa:bb:cc:dd:ee:02',
      }),
    });
    expect(await enroll('h1', userId)).toEqual({ status: 'invalid-code' });
  });

  it('matches a MAC given in a different case', async () => {
    await saveCode('h1', 'AA:BB:CC:DD:EE:02');
    expect((await enroll('h1', userId, 'aa:bb:cc:dd:ee:02')).status).toBe(
      'enrolled',
    );
  });

  it("refuses a wrong hash, another MAC's code, and an expired code", async () => {
    await saveCode('h1');
    await saveCode('h3', 'aa:bb:cc:dd:ee:03');
    await saveCode('h4', 'aa:bb:cc:dd:ee:04', now);
    expect(await enroll('wrong', userId)).toEqual({ status: 'invalid-code' });
    expect(await enroll('h3', userId)).toEqual({ status: 'invalid-code' });
    expect(await enroll('h4', userId, 'aa:bb:cc:dd:ee:04')).toEqual({
      status: 'invalid-code',
    });
  });

  it('reports invalid-code for an enrolled MAC with no code', async () => {
    expect(await enroll('h1', userId, 'aa:bb:cc:dd:ee:01')).toEqual({
      status: 'invalid-code',
    });
  });

  it('keeps the code when the MAC is already enrolled', async () => {
    await saveCode('h1', 'aa:bb:cc:dd:ee:01');
    expect(await enroll('h1', userId, 'aa:bb:cc:dd:ee:01')).toEqual({
      status: 'already-registered',
    });
    const rows = await testDb.db.select().from(pairingCodes);
    expect(rows).toHaveLength(1);
  });

  it('lets only one of two concurrent enrollments use a code', async () => {
    const otherUserId = await insertUser('eleni@example.com');
    await saveCode('h1');
    const results = await Promise.all([
      enroll('h1', userId),
      enroll('h1', otherUserId),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([
      'enrolled',
      'invalid-code',
    ]);
  });
});
