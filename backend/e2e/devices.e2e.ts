import { devices, pairingCodes, users } from '@airremote/db';
import { beforeEach, describe, expect, it } from 'vitest';
import { testEnv } from '../src/__tests__/test-utils';
import { hashPairingCode } from '../src/features/devices/devices.helpers';
import { useTestApp } from './support/test-app';

const api = useTestApp();

const mac = 'aa:bb:cc:dd:ee:01';
const code = '7K4MQ9TX';

function post(path: string, body: unknown, token?: string) {
  return fetch(`${api.baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

/** Registers a user and logs in; returns the user id and access token. */
async function signIn(email = 'nick@example.com') {
  const password = 'correct horse';
  const { id } = await (
    await post('/users/register', {
      email,
      firstName: 'Nick',
      lastName: 'Papas',
      password,
    })
  ).json();
  const { accessToken } = await (
    await post('/auth/login', { email, password })
  ).json();
  return { userId: id as string, token: accessToken as string };
}

function seedCode(
  expiresAt = new Date(Date.now() + 15 * 60_000),
  macAddress = mac,
) {
  return api.db.insert(pairingCodes).values({
    macAddress,
    codeHash: hashPairingCode(code, testEnv.PAIRING_CODE_SECRET),
    expiresAt,
  });
}

const enroll = (token: string | undefined, overrides: object = {}) =>
  post(
    '/devices',
    {
      macAddress: 'AA:BB:CC:DD:EE:01',
      pairingCode: code,
      name: 'Living room',
      ...overrides,
    },
    token,
  );

let session: { userId: string; token: string };

beforeEach(async () => {
  session = await signIn();
});

describe('POST /devices', () => {
  it('enrolls the device under the user and uses up the code', async () => {
    await seedCode();
    const res = await enroll(session.token);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toEqual({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      macAddress: mac,
      name: 'Living room',
      online: false,
    });

    const rows = await api.db.select().from(devices);
    expect(rows).toEqual([
      {
        id: body.id,
        userId: session.userId,
        macAddress: mac,
        name: 'Living room',
        firmwareVersion: null,
      },
    ]);

    const again = await enroll(session.token);
    expect(again.status).toBe(400);
    expect((await again.json()).error.code).toBe('INVALID_PAIRING_CODE');
  });

  it('accepts the code typed in lower case with a hyphen', async () => {
    await seedCode();
    const res = await enroll(session.token, { pairingCode: '7k4m-q9tx' });
    expect(res.status).toBe(201);
  });

  it('refuses a wrong code with 400 INVALID_PAIRING_CODE', async () => {
    await seedCode();
    const res = await enroll(session.token, { pairingCode: '7K4MQ9TY' });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: {
        code: 'INVALID_PAIRING_CODE',
        message: 'Pairing code is invalid or has expired',
      },
    });
  });

  it('refuses an expired code with 400 INVALID_PAIRING_CODE', async () => {
    await seedCode(new Date(Date.now() - 1_000));
    const res = await enroll(session.token);
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('INVALID_PAIRING_CODE');
  });

  it('answers 409 when the MAC is already a device, even with a valid code', async () => {
    const [owner] = await api.db
      .insert(users)
      .values({
        email: 'maria@example.com',
        firstName: 'Maria',
        lastName: 'Kosta',
        passwordHash: 'hash',
        passwordSalt: 'salt',
      })
      .returning();
    await api.db
      .insert(devices)
      .values({ userId: owner!.id, macAddress: mac, name: 'Maria’s remote' });
    await seedCode();

    const res = await enroll(session.token);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: {
        code: 'DEVICE_ALREADY_REGISTERED',
        message: 'Device is already registered',
      },
    });
  });

  it('answers 401 without a token', async () => {
    await seedCode();
    const res = await enroll(undefined);
    expect(res.status).toBe(401);
    expect(res.headers.get('www-authenticate')).toBe('Bearer');
    expect(await api.db.select().from(devices)).toEqual([]);
  });
});
