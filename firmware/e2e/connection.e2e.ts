import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ALLOWED_MAC,
  createApiClient,
  waitFor,
} from '../../backend/e2e/support/api-client';
import { useDeviceServer } from '../../backend/e2e/support/device-server';
import { startFirmware, stopAllFirmware } from './support/firmware-app';

const server = useDeviceServer({ api: true });
const version = (
  await readFile(resolve(import.meta.dirname, '../version.txt'), 'utf8')
).trim();

// The listener is on 127.0.0.1; `localhost` would resolve to ::1 in the container.
const backendUrl = () =>
  new URL(server.url.replace(/^wss:/, 'https:')).origin.replace(
    'localhost',
    '127.0.0.1',
  );

afterEach(async () => {
  await stopAllFirmware();
});

const api = createApiClient(server, { settleWithinMs: 20_000 });

const startConnected = async () => {
  const app = await startFirmware({
    backendUrl: backendUrl(),
    client: 'allowed',
  });
  app.type('wifi test-ssid password123');
  await app.waitForLine('connected', 20_000);
  return app;
};

async function storedVersion(deviceId: string) {
  return (await server.findDevice(deviceId))?.firmwareVersion;
}

describe('the firmware against the device listener', () => {
  it('an enrolled device connects and says hello with its version', async () => {
    const deviceId = await server.allowDevice('aa:bb:cc:dd:ee:01');
    const app = await startFirmware({
      backendUrl: backendUrl(),
      client: 'allowed',
    });

    app.type('wifi test-ssid password123');

    await app.waitForLine('connected', 20_000);
    await waitFor(
      async () => (await storedVersion(deviceId)) === version,
      5_000,
    );
  });

  it('says to pair when not enrolled, and pair enrolls it', async () => {
    const app = await startFirmware({
      backendUrl: backendUrl(),
      client: 'allowed',
    });
    app.type('wifi test-ssid password123');
    await app.waitForLine('not enrolled — type: pair', 20_000);

    app.type('pair');
    const line = await app.waitForLine(
      /^pairing code: [0-9A-Z]{4}-[0-9A-Z]{4} \(expires in 15 min\)$/,
    );
    const pairingCode = line.slice(
      'pairing code: '.length,
      'pairing code: '.length + 9,
    );
    const token = await api.signIn('nick@example.com');
    const enrolled = await api.call('POST', '/devices', token, {
      macAddress: ALLOWED_MAC,
      pairingCode,
      name: 'Living room',
    });
    expect(enrolled.status).toBe(201);

    await app.waitForLine('connected', 10_000);
  });

  it('keeps retrying after a 403, so a device enrolled meanwhile connects', async () => {
    const app = await startFirmware({
      backendUrl: backendUrl(),
      client: 'allowed',
      env: { AIRREMOTE_NOT_ENROLLED_RETRY_MS: '500' },
    });
    app.type('wifi test-ssid password123');
    await app.waitForLine('not enrolled — type: pair', 20_000);

    await server.allowDevice('aa:bb:cc:dd:ee:01');

    await app.waitForLine('connected', 5_000);
    expect(
      app.lines.filter((l) => l === 'not enrolled — type: pair'),
    ).toHaveLength(1);
  });

  it('answers an IR command with INVALID_COMMAND', async () => {
    const token = await api.signIn('nick@example.com');
    const deviceId = await api.enrollDevice(token);
    await startConnected();
    const remote = await api.createRemote(deviceId, token);
    expect(remote.status).toBe(201);

    const learning = await api.learn(remote.body.id, token);
    expect(learning.status).toBe(202);

    const settled = await api.pollUntilSettled(learning.body.id, token);
    expect(settled.status).toBe('failed');
    expect(settled.error?.code).toBe('DEVICE_ERROR');
    expect((await server.findDeviceCommand(learning.body.id))?.errorCode).toBe(
      'INVALID_COMMAND',
    );
  });

  it('reconnects and says hello again after the server drops it', async () => {
    const deviceId = await server.allowDevice('aa:bb:cc:dd:ee:01');
    const app = await startConnected();
    await waitFor(
      async () => (await storedVersion(deviceId)) === version,
      5_000,
    );
    const opened = app.lines.length;

    const sockets = (
      server.server as unknown as {
        websocketServer: { clients: Set<{ terminate(): void }> };
      }
    ).websocketServer.clients;
    for (const socket of sockets) socket.terminate();

    await app.waitForLine('connected', 10_000, opened);
    expect(app.lines.filter((l) => l === 'connected')).toHaveLength(2);
    await waitFor(() => sockets.size === 1, 5_000);
  });

  it('asks for Wi-Fi first, then connects once given it', async () => {
    await server.allowDevice('aa:bb:cc:dd:ee:01');
    const app = await startFirmware({
      backendUrl: backendUrl(),
      client: 'allowed',
    });

    await app.waitForLine('no Wi-Fi — type: wifi <ssid> <password>', 20_000);
    expect(app.lines).not.toContain('connected');
    app.type('wifi test-ssid password123');

    await app.waitForLine('connected', 10_000);
  });

  it('answers status while connecting, and still connects', async () => {
    await server.allowDevice('aa:bb:cc:dd:ee:01');
    const app = await startFirmware({
      backendUrl: backendUrl(),
      client: 'allowed',
    });

    app.type('wifi test-ssid password123');
    app.type('status');

    await app.waitForLine(/^backend {4}/, 20_000);
    await app.waitForLine('firmware   ' + version);
    await app.waitForLine('connected', 10_000);
  });

  it('without an identity, says how to provision and never connects', async () => {
    const app = await startFirmware({ backendUrl: backendUrl(), client: null });

    await app.waitForLine(
      'not provisioned — run scripts/provision-device.sh',
      20_000,
    );
    app.type('wifi test-ssid password123');
    app.type('status');
    await app.waitForLine('identity   missing');
    expect(app.lines).not.toContain('connected');
  });
});
