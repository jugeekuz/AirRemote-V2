import WebSocket from 'ws';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildDeviceServer } from '../src/device-server';
import { createDeviceConnections } from '../src/shared/device-connections';
import { fakeDb, testEnv } from '../src/__tests__/test-utils';
import {
  closeCode,
  connectDevice,
  testDeviceTls,
  useDeviceServer,
} from './support/device-server';

const devices = useDeviceServer({ heartbeatIntervalMs: 100 });

beforeEach(async () => {
  await devices.allowDevice('AA:BB:CC:DD:EE:01');
});

describe('device connections', () => {
  it('closes the older socket with 4000 when the same device connects again', async () => {
    const first = await devices.connect('allowed');
    const firstClosed = closeCode(first);
    const second = await devices.connect('allowed');

    expect(await firstClosed).toBe(4000);
    expect(second.readyState).toBe(WebSocket.OPEN);
  });

  it('drops a client that stops answering pings', async () => {
    const socket = await devices.connect('allowed', { autoPong: false });
    const closed = closeCode(socket);
    const timeout = new Promise<'timeout'>((resolve) =>
      setTimeout(() => resolve('timeout'), 1000),
    );
    expect(await Promise.race([closed, timeout])).not.toBe('timeout');
  });

  it('keeps a client that answers pings', async () => {
    const socket = await devices.connect('allowed');
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(socket.readyState).toBe(WebSocket.OPEN);
  });

  it('closes device sockets with 1001 on shutdown', async () => {
    const authorized = { id: 'device-1', macAddress: 'aa:bb:cc:dd:ee:01' };
    const server = await buildDeviceServer({
      env: testEnv,
      tls: testDeviceTls(),
      db: fakeDb(async () => []),
      connections: createDeviceConnections(),
      service: { authorizeConnection: async () => authorized },
    });
    await server.listen({ host: '127.0.0.1', port: 0 });
    const address = server.server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    const socket = await connectDevice(`wss://localhost:${port}/ws`, 'allowed');
    const closed = closeCode(socket);

    await server.close();

    expect(await closed).toBe(1001);
  });
});
