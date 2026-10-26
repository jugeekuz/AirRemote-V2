import type { DeviceCommandResponse } from '@airremote/contracts';
import { buttons, deviceCommands, remotes } from '@airremote/db';
import { beforeEach, describe, expect, it } from 'vitest';
import { answer, createApiClient } from './support/api-client';
import { nextMessage, useDeviceServer } from './support/device-server';

// Shortened so a silent device expires in 1.5 seconds; `readIr` allows no
// less than one second.
const READ_TIMEOUT_MS = 1_000;
const TTL_MS = 2_000;
const SEND_TTL_MS = 1_500;

const device = useDeviceServer({
  api: true,
  deviceCommandTimings: {
    readTimeoutMs: READ_TIMEOUT_MS,
    ttlMs: TTL_MS,
    sendTtlMs: SEND_TTL_MS,
  },
});

const {
  signIn,
  enrollDevice,
  createRemote,
  press,
  poll,
  pollUntilSettled,
  learnAndRead,
  call,
} = createApiClient(device, { settleWithinMs: SEND_TTL_MS + 3_000 });

/** The longest code a button may hold: 2048 durations, on and off alternating. */
const longTimingsUs = Array.from({ length: 2048 }, (_, i) =>
  i % 2 === 0 ? 9000 - (i % 7) : 65535 - (i % 5),
);

let token: string;
let deviceId: string;
let remoteId: string;
let buttonId: string;

async function insertButton(remote: string, name: string, timings: number[]) {
  const [row] = await device.db
    .insert(buttons)
    .values({ remoteId: remote, name, timingsUs: timings })
    .returning();
  return row!.id;
}

beforeEach(async () => {
  token = await signIn('nick@example.com');
  deviceId = await enrollDevice(token);
  const res = await createRemote(deviceId, token);
  expect(res.status).toBe(201);
  remoteId = res.body.id;
  buttonId = await insertButton(remoteId, 'Power', longTimingsUs);
});

describe('listing', () => {
  it('lists the user’s devices, remotes and buttons in name order, not another user’s', async () => {
    // Created out of order; names sort ignoring case.
    const second = (await createRemote(deviceId, token, 'a/c')).body;
    const mute = await insertButton(remoteId, 'mute', [100, 200]);

    const otherDevice = await device.allowDevice('aa:bb:cc:dd:ee:02');
    const [otherRemote] = await device.db
      .insert(remotes)
      .values({ deviceId: otherDevice, name: 'Theirs', type: 'smart_tv' })
      .returning();
    await insertButton(otherRemote!.id, 'Theirs', [100, 200]);

    const devicesRes = await call('GET', '/devices', token);
    expect(devicesRes.status).toBe(200);
    expect(devicesRes.body).toEqual([
      { id: deviceId, macAddress: 'aa:bb:cc:dd:ee:01', name: 'Living room' },
    ]);

    const remotesRes = await call('GET', '/remotes', token);
    expect(remotesRes.status).toBe(200);
    expect(remotesRes.body).toEqual([
      second,
      { id: remoteId, deviceId, name: 'TV', type: 'smart_tv' },
    ]);

    const buttonsRes = await call('GET', `/remotes/${remoteId}/buttons`, token);
    expect(buttonsRes.status).toBe(200);
    expect(buttonsRes.body).toEqual([
      { id: mute, remoteId, name: 'mute' },
      { id: buttonId, remoteId, name: 'Power' },
    ]);
  });

  it('answers 404 for another user’s remote', async () => {
    const otherToken = await signIn('maria@example.com');
    const res = await call('GET', `/remotes/${remoteId}/buttons`, otherToken);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('pressing a button', { timeout: 15_000 }, () => {
  it('sends exactly the button’s timings and succeeds when the device answers', async () => {
    const socket = await device.connect('allowed');
    const received = nextMessage(socket);

    const res = await press(buttonId, token);
    expect(res.status).toBe(202);
    const command = res.body as DeviceCommandResponse;
    expect(command).toEqual({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      kind: 'send_ir',
      status: 'pending',
      createdAt: expect.any(String),
      expiresAt: expect.any(String),
    });
    expect(res.location).toBe(`/device-commands/${command.id}`);
    expect(Date.parse(command.expiresAt) - Date.parse(command.createdAt)).toBe(
      SEND_TTL_MS,
    );
    expect(await received).toEqual({
      type: 'sendIr',
      commandId: command.id,
      timingsUs: longTimingsUs,
    });

    answer(socket, { type: 'sendIrResult', commandId: command.id });

    const settled = await pollUntilSettled(command.id, token);
    expect(settled).toEqual({ ...command, status: 'succeeded' });
    expect(settled.button).toBeUndefined();
  });

  it('fails with IR_SEND_FAILED when the device reports SEND_FAILED', async () => {
    const socket = await device.connect('allowed');
    const received = nextMessage(socket);
    const { body: command } = await press(buttonId, token);
    await received;

    answer(socket, {
      type: 'error',
      code: 'SEND_FAILED',
      commandId: command.id,
    });

    const settled = await pollUntilSettled(command.id, token);
    expect(settled.status).toBe('failed');
    expect(settled.error?.code).toBe('IR_SEND_FAILED');
  });

  it('expires after the short send lifetime when the device never answers', async () => {
    const socket = await device.connect('allowed');
    const received = nextMessage(socket);
    const { body: command } = await press(buttonId, token);
    await received;

    const settled = await pollUntilSettled(command.id, token);
    expect(settled.status).toBe('expired');
    expect(settled.error?.code).toBe('DEVICE_NOT_RESPONDING');
    expect(Date.now()).toBeGreaterThanOrEqual(Date.parse(command.expiresAt));
  });

  it('answers 409 DEVICE_OFFLINE at once when the device is not connected', async () => {
    const res = await press(buttonId, token);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DEVICE_OFFLINE');
    expect(await device.db.select().from(deviceCommands)).toEqual([]);
  });

  it('answers 409 DEVICE_BUSY during a learn, which still succeeds afterwards', async () => {
    const socket = await device.connect('allowed');
    const { command: learning } = await learnAndRead(
      socket,
      remoteId,
      token,
      'Mute',
    );

    const res = await press(buttonId, token);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DEVICE_BUSY');

    const timingsUs = [9000, 4500, 560, 560];
    answer(socket, {
      type: 'readIrResult',
      commandId: learning.id,
      timingsUs,
    });

    const settled = await pollUntilSettled(learning.id, token);
    expect(settled.status).toBe('succeeded');
    expect(settled.button).toMatchObject({ remoteId, name: 'Mute' });
    expect(
      (await device.db.select().from(buttons)).find((b) => b.name === 'Mute')
        ?.timingsUs,
    ).toEqual(timingsUs);
  });

  it('answers 404 for another user’s button and creates no command', async () => {
    await device.connect('allowed');
    const otherToken = await signIn('maria@example.com');

    const res = await press(buttonId, otherToken);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(await device.db.select().from(deviceCommands)).toEqual([]);
  });

  it('keeps the press command readable by its owner only', async () => {
    const socket = await device.connect('allowed');
    const received = nextMessage(socket);
    const { body: command } = await press(buttonId, token);
    await received;

    const otherToken = await signIn('maria@example.com');
    expect((await poll(command.id, otherToken)).status).toBe(404);
    expect((await poll(command.id, token)).body.status).toBe('pending');
  });
});
