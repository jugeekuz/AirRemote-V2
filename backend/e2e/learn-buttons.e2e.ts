import { setTimeout as delay } from 'node:timers/promises';
import type { DeviceCommandResponse } from '@airremote/contracts';
import { buttons, createDb, deviceCommands } from '@airremote/db';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type WebSocket from 'ws';
import { createDeviceCommandsRepository } from '../src/features/device-commands/device-commands.repository';
import { nextMessage, useDeviceServer } from './support/device-server';

// Shortened so a silent device expires in two seconds; `readIr` allows no
// less than one second.
const READ_TIMEOUT_MS = 1_000;
const TTL_MS = 2_000;

const device = useDeviceServer({
  api: true,
  deviceCommandTimings: { readTimeoutMs: READ_TIMEOUT_MS, ttlMs: TTL_MS },
});

const mac = 'aa:bb:cc:dd:ee:01';
const timingsUs = [9000, 4500, 560, 560, 560, 1690, 560, 0, 560];

/** Connection ids whose close the device server has reported, this test. */
const closedConnections: string[] = [];

beforeAll(() => {
  device.connections.onConnectionClosed((_deviceId, connectionId) => {
    closedConnections.push(connectionId);
  });
});

type ApiResponse = {
  status: number;
  location: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any;
};

async function call(
  method: 'GET' | 'POST',
  path: string,
  token: string,
  body?: unknown,
): Promise<ApiResponse> {
  const res = await fetch(`${device.apiUrl}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return {
    status: res.status,
    location: res.headers.get('location'),
    body: text ? JSON.parse(text) : null,
  };
}

/** Registers a user and logs in; returns the access token. */
async function signIn(email: string): Promise<string> {
  const password = 'correct horse';
  const post = (path: string, body: unknown) =>
    fetch(`${device.apiUrl}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  await post('/users/register', {
    email,
    firstName: 'Nick',
    lastName: 'Papas',
    password,
  });
  const res = await post('/auth/login', { email, password });
  return (await res.json()).accessToken;
}

/** Enrolls the `allowed` test device under the user; returns its id. */
async function enrollDevice(token: string): Promise<string> {
  const issued = await device.post('/pairing-code', 'allowed');
  expect(issued.status).toBe(201);
  const { pairingCode } = issued.body as { pairingCode: string };
  const res = await call('POST', '/devices', token, {
    macAddress: mac,
    pairingCode,
    name: 'Living room',
  });
  expect(res.status).toBe(201);
  return res.body.id;
}

function createRemote(deviceId: string, token: string, name = 'TV') {
  return call('POST', `/devices/${deviceId}/remotes`, token, {
    name,
    type: 'smart_tv',
  });
}

function learn(remoteId: string, token: string, name = 'Power') {
  return call('POST', `/remotes/${remoteId}/buttons`, token, { name });
}

function poll(commandId: string, token: string) {
  return call('GET', `/device-commands/${commandId}`, token);
}

/** Polls every 50 ms until the command is no longer pending, or `withinMs` passes. */
async function pollUntilSettled(
  commandId: string,
  token: string,
  withinMs = TTL_MS + 3_000,
): Promise<DeviceCommandResponse> {
  const deadline = Date.now() + withinMs;
  for (;;) {
    const res = await poll(commandId, token);
    expect(res.status).toBe(200);
    if (res.body.status !== 'pending' || Date.now() > deadline) return res.body;
    await delay(50);
  }
}

/** Waits, every 20 ms up to `withinMs`, until `check` returns true. */
async function waitFor(
  check: () => boolean | Promise<boolean>,
  withinMs = 3_000,
) {
  const deadline = Date.now() + withinMs;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error('waitFor: timed out');
    await delay(20);
  }
}

/** Sends the next `learn` and returns the command with the `readIr` the device got. */
async function learnAndRead(
  socket: WebSocket,
  remoteId: string,
  token: string,
  name = 'Power',
) {
  const read = nextMessage(socket);
  const res = await learn(remoteId, token, name);
  expect(res.status).toBe(202);
  return { command: res.body as DeviceCommandResponse, read: await read };
}

function answer(socket: WebSocket, message: object) {
  socket.send(JSON.stringify(message));
}

let token: string;
let deviceId: string;

beforeEach(async () => {
  closedConnections.length = 0;
  token = await signIn('nick@example.com');
  deviceId = await enrollDevice(token);
});

describe('POST /devices/:deviceId/remotes', () => {
  it('creates a remote on the user’s device', async () => {
    const res = await createRemote(deviceId, token);
    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      deviceId,
      name: 'TV',
      type: 'smart_tv',
    });
  });

  it('refuses a name already used on the device, ignoring case, with 409', async () => {
    expect((await createRemote(deviceId, token, 'TV')).status).toBe(201);
    const res = await createRemote(deviceId, token, 'tv');
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('REMOTE_NAME_TAKEN');
  });

  it('answers 404 for another user’s device', async () => {
    const othersDevice = await device.allowDevice('aa:bb:cc:dd:ee:02');
    const res = await createRemote(othersDevice, token);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('learning a button', { timeout: 15_000 }, () => {
  let remoteId: string;

  beforeEach(async () => {
    const res = await createRemote(deviceId, token);
    expect(res.status).toBe(201);
    remoteId = res.body.id;
  });

  it('saves exactly the timings the device read', async () => {
    const socket = await device.connect('allowed');
    const read = nextMessage(socket);

    const res = await learn(remoteId, token);
    expect(res.status).toBe(202);
    const command = res.body as DeviceCommandResponse;
    expect(command).toEqual({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      kind: 'learn_button',
      status: 'pending',
      createdAt: expect.any(String),
      expiresAt: expect.any(String),
    });
    expect(res.location).toBe(`/device-commands/${command.id}`);
    expect(Date.parse(command.expiresAt) - Date.parse(command.createdAt)).toBe(
      TTL_MS,
    );
    expect(await read).toEqual({
      type: 'readIr',
      commandId: command.id,
      timeoutMs: READ_TIMEOUT_MS,
    });

    answer(socket, { type: 'readIrResult', commandId: command.id, timingsUs });

    const settled = await pollUntilSettled(command.id, token);
    expect(settled).toEqual({
      ...command,
      status: 'succeeded',
      button: { id: expect.any(String), remoteId, name: 'Power' },
    });
    expect(await device.db.select().from(buttons)).toEqual([
      { id: settled.button!.id, remoteId, name: 'Power', timingsUs },
    ]);
  });

  it('fails with IR_READ_TIMEOUT and saves no button when the device saw no code', async () => {
    const socket = await device.connect('allowed');
    const { command } = await learnAndRead(socket, remoteId, token);

    answer(socket, {
      type: 'error',
      code: 'READ_TIMEOUT',
      commandId: command.id,
    });

    const settled = await pollUntilSettled(command.id, token);
    expect(settled.status).toBe('failed');
    expect(settled.error?.code).toBe('IR_READ_TIMEOUT');
    expect(settled.button).toBeUndefined();
    expect(await device.db.select().from(buttons)).toEqual([]);
  });

  it('answers 409 DEVICE_OFFLINE at once when the device is not connected', async () => {
    const res = await learn(remoteId, token);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DEVICE_OFFLINE');
    expect(await device.db.select().from(deviceCommands)).toEqual([]);
  });

  it('answers 409 DEVICE_BUSY while another command is pending', async () => {
    const socket = await device.connect('allowed');
    await learnAndRead(socket, remoteId, token);

    const res = await learn(remoteId, token, 'Mute');
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DEVICE_BUSY');
  });

  it('expires a command the device never answers, then accepts the next', async () => {
    const socket = await device.connect('allowed');
    const { command } = await learnAndRead(socket, remoteId, token);

    const settled = await pollUntilSettled(command.id, token);
    expect(settled.status).toBe('expired');
    expect(settled.error?.code).toBe('DEVICE_NOT_RESPONDING');
    expect(Date.now()).toBeGreaterThanOrEqual(Date.parse(command.expiresAt));

    const next = await learnAndRead(socket, remoteId, token);
    expect(next.command.id).not.toBe(command.id);
    expect(next.read).toMatchObject({ commandId: next.command.id });
  });

  it('fails with DEVICE_NOT_RESPONDING as soon as the device disconnects', async () => {
    const socket = await device.connect('allowed');
    const { command } = await learnAndRead(socket, remoteId, token);

    socket.terminate();

    const settled = await pollUntilSettled(command.id, token);
    expect(settled.status).toBe('failed');
    expect(settled.error?.code).toBe('DEVICE_NOT_RESPONDING');
    expect(Date.now()).toBeLessThan(Date.parse(command.expiresAt));
  });

  it('a reconnect does not fail a command sent over the new connection', async () => {
    const old = await device.connect('allowed');
    // The old client stops reading, so it never answers the server's close
    // frame and the server reports its close only once the client goes.
    (old as unknown as { _socket: { pause(): void } })._socket.pause();
    const current = await device.connect('allowed');

    const { command, read } = await learnAndRead(current, remoteId, token);
    expect(read).toMatchObject({ type: 'readIr', commandId: command.id });
    expect(closedConnections).toEqual([]);

    old.terminate();
    await waitFor(() => closedConnections.length === 1);
    expect((await poll(command.id, token)).body.status).toBe('pending');

    answer(current, { type: 'readIrResult', commandId: command.id, timingsUs });

    const settled = await pollUntilSettled(command.id, token);
    expect(settled.status).toBe('succeeded');
    expect(settled.button).toEqual({
      id: expect.any(String),
      remoteId,
      name: 'Power',
    });
  });

  it('saves the button when nobody is polling', async () => {
    const socket = await device.connect('allowed');
    const { command } = await learnAndRead(socket, remoteId, token);

    answer(socket, { type: 'readIrResult', commandId: command.id, timingsUs });
    await waitFor(
      async () => (await device.db.select().from(buttons)).length === 1,
    );

    const res = await poll(command.id, token);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('succeeded');
    expect(res.body.button).toMatchObject({ remoteId, name: 'Power' });
  });

  it('answers 404 for another user’s remote or command', async () => {
    const socket = await device.connect('allowed');
    const { command } = await learnAndRead(socket, remoteId, token);
    const otherToken = await signIn('maria@example.com');

    const learnRes = await learn(remoteId, otherToken, 'Mute');
    expect(learnRes.status).toBe(404);
    expect(learnRes.body.error.code).toBe('NOT_FOUND');

    const pollRes = await poll(command.id, otherToken);
    expect(pollRes.status).toBe(404);
    expect(pollRes.body.error.code).toBe('NOT_FOUND');
  });

  it('reports a command settled through another database connection', async () => {
    const socket = await device.connect('allowed');
    const { command } = await learnAndRead(socket, remoteId, token);

    // Stands in for another backend instance holding the device's socket.
    const other = createDb(device.databaseUrl);
    try {
      const outcome = await createDeviceCommandsRepository(
        other.db,
      ).completeLearnButton({ id: command.id, deviceId, timingsUs });
      expect(outcome).toBe('succeeded');
    } finally {
      await other.close();
    }

    const res = await poll(command.id, token);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('succeeded');
    expect(res.body.button).toMatchObject({ remoteId, name: 'Power' });
  });
});
