import { devices } from '@airremote/db';
import { beforeEach, describe, expect, it } from 'vitest';
import { answer, createApiClient, waitFor } from './support/api-client';
import { nextMessage, useDeviceServer } from './support/device-server';

const device = useDeviceServer({ api: true });
const { call, signIn, enrollDevice } = createApiClient(device, {
  settleWithinMs: 3_000,
});

let token: string;
let deviceId: string;

beforeEach(async () => {
  token = await signIn('nick@example.com');
  deviceId = await enrollDevice(token);
});

async function storedVersion(): Promise<string | null | undefined> {
  const rows = await device.db.select().from(devices);
  return rows.find((row) => row.id === deviceId)?.firmwareVersion;
}

/** `hello` gets no reply, so wait for the row instead. */
async function waitForVersion(version: string) {
  await waitFor(async () => (await storedVersion()) === version, 2_000);
}

describe('hello', () => {
  it('stores the version a device says hello with', async () => {
    expect(await storedVersion()).toBeNull();
    const socket = await device.connect('allowed');

    answer(socket, { type: 'hello', firmwareVersion: '0.1.0' });

    await waitForVersion('0.1.0');
  });

  it('replaces the version with a later hello', async () => {
    const socket = await device.connect('allowed');

    answer(socket, { type: 'hello', firmwareVersion: '0.1.0' });
    await waitForVersion('0.1.0');
    answer(socket, { type: 'hello', firmwareVersion: '0.2.0' });

    await waitForVersion('0.2.0');
  });

  it('answers an invalid version with INVALID_MESSAGE and stores nothing', async () => {
    const socket = await device.connect('allowed');
    const reply = nextMessage(socket);

    answer(socket, { type: 'hello', firmwareVersion: 'v1' });

    expect(await reply).toMatchObject({
      type: 'error',
      code: 'INVALID_MESSAGE',
    });
    expect(await storedVersion()).toBeNull();
  });

  it('does not show the version in the devices list', async () => {
    const socket = await device.connect('allowed');
    answer(socket, { type: 'hello', firmwareVersion: '0.1.0' });
    await waitForVersion('0.1.0');

    const res = await call('GET', '/devices', token);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      {
        id: deviceId,
        macAddress: 'aa:bb:cc:dd:ee:01',
        name: 'Living room',
        online: true,
      },
    ]);
  });
});
