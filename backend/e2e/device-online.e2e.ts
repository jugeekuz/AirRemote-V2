import { beforeEach, describe, expect, it } from 'vitest';
import { testEnv } from '../src/__tests__/test-utils';
import { hashPairingCode } from '../src/features/devices/devices.helpers';
import { pairingCodes } from '@airremote/db';
import { closeCode, useDeviceServer } from './support/device-server';

const server = useDeviceServer({ api: true });

const mac = 'aa:bb:cc:dd:ee:01';
const code = '7K4MQ9TX';

function post(path: string, body: unknown, token?: string) {
  return fetch(`${server.apiUrl}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

let token: string;

async function listDevices() {
  const res = await fetch(`${server.apiUrl}/devices`, {
    headers: { authorization: `Bearer ${token}` },
  });
  expect(res.status).toBe(200);
  return (await res.json()) as { id: string; online: boolean }[];
}

beforeEach(async () => {
  const email = 'nick@example.com';
  const password = 'correct horse';
  await post('/users/register', {
    email,
    firstName: 'Nick',
    lastName: 'Papas',
    password,
  });
  const login = await post('/auth/login', { email, password });
  token = (await login.json()).accessToken;
});

/** Enrolls the MAC through the API so the user owns it. */
async function enrollDevice() {
  await server.db.insert(pairingCodes).values({
    macAddress: mac,
    codeHash: hashPairingCode(code, testEnv.PAIRING_CODE_SECRET),
    expiresAt: new Date(Date.now() + 15 * 60_000),
  });
  return post(
    '/devices',
    { macAddress: mac, pairingCode: code, name: 'Living room' },
    token,
  );
}

describe('device online status', () => {
  it('is false when enrolled, true while connected, false after it disconnects', async () => {
    const enrolled = await enrollDevice();
    expect(enrolled.status).toBe(201);
    expect(await enrolled.json()).toMatchObject({ online: false });
    expect(await listDevices()).toMatchObject([{ online: false }]);

    const socket = await server.connect('allowed');
    expect(await listDevices()).toMatchObject([{ online: true }]);

    const closed = closeCode(socket);
    socket.close();
    await closed;
    await expect.poll(async () => (await listDevices())[0]?.online).toBe(false);
  });
});
