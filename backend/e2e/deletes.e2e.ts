import { buttons, remotes } from '@airremote/db';
import { beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { createApiClient } from './support/api-client';
import {
  closeCode,
  UpgradeRejectedError,
  useDeviceServer,
} from './support/device-server';

const device = useDeviceServer({ api: true });

const { call, signIn, enrollDevice, createRemote, learnAndRead, poll, press } =
  createApiClient(device, { settleWithinMs: 3_000 });

const MISSING_ID = '00000000-0000-4000-8000-000000000000';

let token: string;
let deviceId: string;
let remoteId: string;
let buttonId: string;

async function insertButton(remote: string, name: string) {
  const [row] = await device.db
    .insert(buttons)
    .values({ remoteId: remote, name, timingsUs: [9000, 4500, 560] })
    .returning();
  return row!.id;
}

/** A device, remote and button of another user; the device is `unknown`'s MAC. */
async function insertOtherUsersDevice() {
  const otherDeviceId = await device.allowDevice('aa:bb:cc:dd:ee:02');
  const [otherRemote] = await device.db
    .insert(remotes)
    .values({ deviceId: otherDeviceId, name: 'Theirs', type: 'smart_tv' })
    .returning();
  const otherButtonId = await insertButton(otherRemote!.id, 'Theirs');
  return {
    deviceId: otherDeviceId,
    remoteId: otherRemote!.id,
    buttonId: otherButtonId,
  };
}

function expectNotFound(res: { status: number; body: unknown }) {
  expect(res.status).toBe(404);
  expect(res.body).toMatchObject({ error: { code: 'NOT_FOUND' } });
}

beforeEach(async () => {
  token = await signIn('nick@example.com');
  deviceId = await enrollDevice(token);
  const res = await createRemote(deviceId, token);
  expect(res.status).toBe(201);
  remoteId = res.body.id;
  buttonId = await insertButton(remoteId, 'Power');
});

describe('DELETE /devices/:deviceId', () => {
  it('deletes the device with its remotes and buttons', async () => {
    const res = await call('DELETE', `/devices/${deviceId}`, token);
    expect(res.status).toBe(204);
    expect(res.body).toBeNull();

    expect((await call('GET', '/devices', token)).body).toEqual([]);
    expect((await call('GET', '/remotes', token)).body).toEqual([]);
    expectNotFound(await call('GET', `/remotes/${remoteId}/buttons`, token));
    expect(await device.findButton(buttonId)).toBeNull();
  });

  it('closes a connected device’s socket with 4001, refuses its reconnect and lets it pair again', async () => {
    const socket = await device.connect('allowed');
    const closed = closeCode(socket);

    expect((await call('DELETE', `/devices/${deviceId}`, token)).status).toBe(
      204,
    );
    expect(await closed).toBe(4001);
    expect(device.connections.isConnected(deviceId)).toBe(false);

    await expect(device.connect('allowed')).rejects.toEqual(
      new UpgradeRejectedError(403),
    );

    const issued = await device.post('/pairing-code', 'allowed');
    expect(issued.status).toBe(201);
    expect(issued.body).toMatchObject({ pairingCode: expect.any(String) });

    // Enrolling again makes it a new device, which may connect.
    const enrolledAgain = await enrollDevice(token);
    expect(enrolledAgain).not.toBe(deviceId);
    const reconnected = await device.connect('allowed');
    expect(reconnected.readyState).toBe(WebSocket.OPEN);
  });

  it('deletes the device’s pending command, so polling it answers 404', async () => {
    const socket = await device.connect('allowed');
    const { command } = await learnAndRead(socket, remoteId, token, 'Mute');
    expect((await poll(command.id, token)).body).toMatchObject({
      status: 'pending',
    });

    expect((await call('DELETE', `/devices/${deviceId}`, token)).status).toBe(
      204,
    );

    expectNotFound(await poll(command.id, token));
    expect(await device.findDeviceCommand(command.id)).toBeNull();
  });

  it('answers 404 NOT_FOUND for another user’s device, leaving it connected', async () => {
    const theirs = await insertOtherUsersDevice();
    const socket = await device.connect('unknown');

    expectNotFound(await call('DELETE', `/devices/${theirs.deviceId}`, token));

    expect(await device.findDevice(theirs.deviceId)).not.toBeNull();
    expect(socket.readyState).toBe(WebSocket.OPEN);
    expect(device.connections.isConnected(theirs.deviceId)).toBe(true);
  });

  it('answers 404 NOT_FOUND for a device that does not exist', async () => {
    expectNotFound(await call('DELETE', `/devices/${MISSING_ID}`, token));
  });

  it('answers 401 without a token', async () => {
    const res = await fetch(`${device.apiUrl}/devices/${deviceId}`, {
      method: 'DELETE',
    });
    expect(res.status).toBe(401);
    expect(await device.findDevice(deviceId)).not.toBeNull();
  });
});

describe('DELETE /remotes/:remoteId', () => {
  it('deletes the remote with its buttons, leaving the device and its other remotes', async () => {
    const other = (await createRemote(deviceId, token, 'Heater')).body;

    const res = await call('DELETE', `/remotes/${remoteId}`, token);
    expect(res.status).toBe(204);
    expect(res.body).toBeNull();

    expect((await call('GET', '/remotes', token)).body).toEqual([other]);
    expectNotFound(await call('GET', `/remotes/${remoteId}/buttons`, token));
    expect(await device.findButton(buttonId)).toBeNull();
    expect((await call('GET', '/devices', token)).body).toHaveLength(1);
  });

  it('answers 404 NOT_FOUND for another user’s remote, leaving it', async () => {
    const theirs = await insertOtherUsersDevice();

    expectNotFound(await call('DELETE', `/remotes/${theirs.remoteId}`, token));

    expect(await device.findButton(theirs.buttonId)).not.toBeNull();
  });

  it('answers 404 NOT_FOUND for a remote that does not exist', async () => {
    expectNotFound(await call('DELETE', `/remotes/${MISSING_ID}`, token));
  });
});

describe('DELETE /buttons/:buttonId', () => {
  it('deletes the button, leaving the remote’s other buttons', async () => {
    const muteId = await insertButton(remoteId, 'Mute');

    const res = await call('DELETE', `/buttons/${buttonId}`, token);
    expect(res.status).toBe(204);
    expect(res.body).toBeNull();

    expect(
      (await call('GET', `/remotes/${remoteId}/buttons`, token)).body,
    ).toEqual([{ id: muteId, remoteId, name: 'Mute' }]);
    expectNotFound(await press(buttonId, token));
  });

  it('answers 404 NOT_FOUND for another user’s button, leaving it', async () => {
    const theirs = await insertOtherUsersDevice();

    expectNotFound(await call('DELETE', `/buttons/${theirs.buttonId}`, token));

    expect(await device.findButton(theirs.buttonId)).not.toBeNull();
  });

  it('answers 404 NOT_FOUND for a button that does not exist', async () => {
    expectNotFound(await call('DELETE', `/buttons/${MISSING_ID}`, token));
  });
});
