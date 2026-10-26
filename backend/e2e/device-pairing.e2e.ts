import { describe, expect, it } from 'vitest';
import { UpgradeRejectedError, useDeviceServer } from './support/device-server';

const device = useDeviceServer({ api: true });

const allowedMac = 'aa:bb:cc:dd:ee:01';

function postToApi(path: string, body: unknown, token?: string) {
  return fetch(`${device.apiUrl}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

async function signIn(): Promise<string> {
  const user = {
    email: 'nick@example.com',
    firstName: 'Nick',
    lastName: 'Papas',
    password: 'correct horse',
  };
  await postToApi('/users/register', user);
  const res = await postToApi('/auth/login', {
    email: user.email,
    password: user.password,
  });
  return (await res.json()).accessToken;
}

function enroll(token: string, pairingCode: string) {
  return postToApi(
    '/devices',
    { macAddress: allowedMac, pairingCode, name: 'Living room' },
    token,
  );
}

async function issuedCode(): Promise<string> {
  const res = await device.post('/pairing-code', 'allowed');
  expect(res.status).toBe(201);
  return (res.body as { pairingCode: string }).pairingCode;
}

describe('POST /pairing-code', () => {
  it('issues an 8-character code that expires in 15 minutes', async () => {
    const res = await device.post('/pairing-code', 'allowed');
    expect(res.status).toBe(201);
    const body = res.body as { pairingCode: string; expiresAt: string };
    expect(body.pairingCode).toMatch(/^[0-9A-HJKMNP-TV-Z]{8}$/);
    const inFifteenMinutes = Date.now() + 15 * 60_000;
    expect(
      Math.abs(Date.parse(body.expiresAt) - inFifteenMinutes),
    ).toBeLessThan(5_000);
  });

  it('replaces the previous code when asked again', async () => {
    const first = await issuedCode();
    const second = await issuedCode();
    const token = await signIn();

    const stale = await enroll(token, first);
    expect(stale.status).toBe(400);
    expect((await stale.json()).error.code).toBe('INVALID_PAIRING_CODE');
    expect((await enroll(token, second)).status).toBe(201);
  });

  it.each(['notAMac', 'twoCommonNames'] as const)(
    'refuses a certificate that does not identify a device (%s) with 403',
    async (cert) => {
      const res = await device.post('/pairing-code', cert);
      expect(res).toEqual({
        status: 403,
        body: {
          error: {
            code: 'INVALID_DEVICE_CERTIFICATE',
            message: 'Client certificate does not identify a device',
          },
        },
      });
    },
  );

  it.each(['foreignCa', null] as const)(
    'fails the TLS handshake for %s',
    async (cert) => {
      await expect(device.post('/pairing-code', cert)).rejects.toThrow();
    },
  );

  it('refuses an enrolled device with 409', async () => {
    await device.allowDevice(allowedMac);
    const res = await device.post('/pairing-code', 'allowed');
    expect(res).toEqual({
      status: 409,
      body: {
        error: {
          code: 'DEVICE_ALREADY_REGISTERED',
          message: 'Device is already registered',
        },
      },
    });
  });
});

describe('enrolling a device', () => {
  it('lets the device connect once its owner has enrolled it', async () => {
    await expect(device.connect('allowed')).rejects.toEqual(
      new UpgradeRejectedError(403),
    );

    const pairingCode = await issuedCode();
    const token = await signIn();
    // The certificate CN is upper case; the owner types the MAC in lower case.
    const res = await enroll(token, pairingCode);
    expect(res.status).toBe(201);

    const socket = await device.connect('allowed');
    expect(socket.protocol).toBe('airremote.v1');
  });
});
