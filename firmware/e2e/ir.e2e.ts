import { afterEach, describe, expect, it } from 'vitest';
import { createApiClient, waitFor } from '../../backend/e2e/support/api-client';
import { useDeviceServer } from '../../backend/e2e/support/device-server';
import { startFirmware, stopAllFirmware } from './support/firmware-app';

// A short read, so the timeout case doesn't wait the default 15 s.
const READ_TIMEOUT_MS = 2_000;
const server = useDeviceServer({
  api: true,
  deviceCommandTimings: {
    readTimeoutMs: READ_TIMEOUT_MS,
    ttlMs: READ_TIMEOUT_MS + 3_000,
  },
});
const api = createApiClient(server, {
  settleWithinMs: READ_TIMEOUT_MS + 5_000,
});

// The listener is on 127.0.0.1; `localhost` would resolve to ::1 in the container.
const backendUrl = () =>
  new URL(server.url.replace(/^wss:/, 'https:')).origin.replace(
    'localhost',
    '127.0.0.1',
  );

afterEach(async () => {
  await stopAllFirmware();
});

/** An NEC-shaped code: a 9 ms burst, a 4.5 ms space, 32 bits, a stop mark. */
const NEC = [
  9000,
  4500,
  ...[...'00100000010000001100000000111111'].flatMap((bit) => [
    560,
    bit === '1' ? 1690 : 560,
  ]),
  560,
];

/** A connected firmware owned by a signed-in user, with a remote to learn into. */
async function readyToLearn() {
  const token = await api.signIn('nick@example.com');
  const deviceId = await api.enrollDevice(token);
  const app = await startFirmware({
    backendUrl: backendUrl(),
    client: 'allowed',
  });
  app.type('wifi test-ssid password123');
  await app.waitForLine('connected', 20_000);
  const remote = await api.createRemote(deviceId, token);
  expect(remote.status).toBe(201);
  return { app, token, remoteId: remote.body.id as string };
}

describe('reading IR', () => {
  it('learning a button stores the code the receiver saw, parts and gaps included', async () => {
    const { app, token, remoteId } = await readyToLearn();
    const parts = [NEC.slice(0, 31), NEC.slice(0, 41), NEC.slice(0, 25)];

    const learning = await api.learn(remoteId, token);
    expect(learning.status).toBe(202);
    await app.pressIr(parts, [35, 40]);

    const settled = await api.pollUntilSettled(learning.body.id, token);
    expect(settled.status).toBe('succeeded');
    const button = await server.findButton(settled.button!.id);
    expect(button?.timingsUs).toEqual([
      ...parts[0]!,
      35_000,
      ...parts[1]!,
      40_000,
      ...parts[2]!,
    ]);
  });

  it('learning without a code ends with IR_READ_TIMEOUT', async () => {
    const { token, remoteId } = await readyToLearn();

    const learning = await api.learn(remoteId, token);
    expect(learning.status).toBe(202);

    const settled = await api.pollUntilSettled(learning.body.id, token);
    expect(settled.status).toBe('failed');
    expect(settled.error?.code).toBe('IR_READ_TIMEOUT');
  });

  it('ir prints what it captured', async () => {
    const app = await startFirmware({
      backendUrl: backendUrl(),
      client: 'allowed',
    });

    app.type('ir');
    await app.waitForLine('listening for an IR code (10 s) …', 20_000);
    await app.pressIr([NEC]);

    await app.waitForLine(`IR code: 1 part; ${NEC.length} timings`);
    await app.waitForLine(`timings: ${NEC.join(',')}`);
  });

  it('pressing a learned button sends exactly its code', async () => {
    const { app, token, remoteId } = await readyToLearn();
    const learning = await api.learn(remoteId, token);
    await app.pressIr([NEC]);
    const learned = await api.pollUntilSettled(learning.body.id, token);
    expect(learned.status).toBe('succeeded');

    const pressing = await api.press(learned.button!.id, token);
    expect(pressing.status).toBe(202);

    const sent = await api.pollUntilSettled(pressing.body.id, token);
    expect(sent.status).toBe('succeeded');
    await waitFor(async () => (await app.sentIr()).length === 1, 2_000);
    expect(await app.sentIr()).toEqual([NEC]);
  });

  it('ir selftest hears its own test code', async () => {
    const app = await startFirmware({
      backendUrl: backendUrl(),
      client: 'allowed',
    });

    app.type('ir selftest');

    await app.waitForLine(
      'IR self-test: OK (sent 67 timings, heard 67)',
      20_000,
    );
  });
});
