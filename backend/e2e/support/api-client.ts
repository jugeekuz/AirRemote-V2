import { setTimeout as delay } from 'node:timers/promises';
import type { DeviceCommandResponse } from '@airremote/contracts';
import { expect } from 'vitest';
import type WebSocket from 'ws';
import { nextMessage, type useDeviceServer } from './device-server';

export type ApiResponse = {
  status: number;
  location: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any;
};

/** The MAC address of the `allowed` test device. */
export const ALLOWED_MAC = 'aa:bb:cc:dd:ee:01';

/** Waits, every 20 ms up to `withinMs`, until `check` returns true. */
export async function waitFor(
  check: () => boolean | Promise<boolean>,
  withinMs = 3_000,
) {
  const deadline = Date.now() + withinMs;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error('waitFor: timed out');
    await delay(20);
  }
}

/** Sends a JSON message from a test device. */
export function answer(socket: WebSocket, message: object) {
  socket.send(JSON.stringify(message));
}

/**
 * HTTP helpers for e2e tests that run the API (`useDeviceServer({ api: true })`):
 * signing in, enrolling through the real pairing flow, and the device command
 * endpoints.
 */
export function createApiClient(
  device: ReturnType<typeof useDeviceServer>,
  { settleWithinMs }: { settleWithinMs: number },
) {
  async function call(
    method: 'GET' | 'POST' | 'DELETE',
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
      macAddress: ALLOWED_MAC,
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

  function press(buttonId: string, token: string) {
    return call('POST', `/buttons/${buttonId}/press`, token);
  }

  function poll(commandId: string, token: string) {
    return call('GET', `/device-commands/${commandId}`, token);
  }

  /** Polls every 50 ms until the command is no longer pending, or the bound passes. */
  async function pollUntilSettled(
    commandId: string,
    token: string,
    withinMs = settleWithinMs,
  ): Promise<DeviceCommandResponse> {
    const deadline = Date.now() + withinMs;
    for (;;) {
      const res = await poll(commandId, token);
      expect(res.status).toBe(200);
      if (res.body.status !== 'pending' || Date.now() > deadline) {
        return res.body;
      }
      await delay(50);
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

  return {
    call,
    signIn,
    enrollDevice,
    createRemote,
    learn,
    press,
    poll,
    pollUntilSettled,
    learnAndRead,
  };
}
