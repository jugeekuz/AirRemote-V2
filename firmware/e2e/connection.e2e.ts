import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { afterEach, describe, it } from 'vitest';
import { waitFor } from '../../backend/e2e/support/api-client';
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
});
