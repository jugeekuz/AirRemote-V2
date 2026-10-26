import { request } from 'node:https';
import { beforeEach, describe, expect, it, inject } from 'vitest';
import { buildDeviceServer } from '../src/device-server';
import { createDeviceConnections } from '../src/shared/device-connections';
import { fakeDb, testEnv } from '../src/__tests__/test-utils';
import {
  connectDevice,
  testDeviceTls,
  UpgradeRejectedError,
  useDeviceServer,
} from './support/device-server';

const devices = useDeviceServer();

beforeEach(async () => {
  await devices.allowDevice('AA:BB:CC:DD:EE:01');
});

describe('device handshake', () => {
  it('connects an allowed device over mTLS with the airremote.v1 subprotocol', async () => {
    const socket = await devices.connect('allowed');
    expect(socket.protocol).toBe('airremote.v1');
  });

  it("connects when the certificate's MAC differs in case from the stored one", async () => {
    await expect(devices.connect('allowedLowerCase')).resolves.toBeDefined();
  });

  it('fails the TLS handshake without a client certificate', async () => {
    const attempt = devices.connect(null);
    await expect(attempt).rejects.toBeDefined();
    await expect(attempt).rejects.not.toBeInstanceOf(UpgradeRejectedError);
  });

  it('fails the TLS handshake for a certificate from another CA', async () => {
    const attempt = devices.connect('foreignCa');
    await expect(attempt).rejects.toBeDefined();
    await expect(attempt).rejects.not.toBeInstanceOf(UpgradeRejectedError);
  });

  it('rejects a certificate whose MAC has no devices row with 403', async () => {
    await expect(devices.connect('unknown')).rejects.toMatchObject({
      status: 403,
    });
  });

  it('rejects a common name that is not a MAC with 403', async () => {
    await expect(devices.connect('notAMac')).rejects.toMatchObject({
      status: 403,
    });
  });

  it('rejects a certificate with two common names with 403', async () => {
    await expect(devices.connect('twoCommonNames')).rejects.toMatchObject({
      status: 403,
    });
  });

  it('rejects a missing or different subprotocol with 400', async () => {
    await expect(
      devices.connect('allowed', { protocol: null }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      devices.connect('allowed', { protocol: 'airremote.v2' }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('answers 404 in the error envelope for any other path', async () => {
    const certs = inject('deviceCerts');
    const { port } = new URL(devices.url);
    const response = await new Promise<{ status: number; body: string }>(
      (resolve, reject) => {
        const req = request(
          {
            host: 'localhost',
            port,
            path: '/nope',
            ca: certs.ca,
            cert: certs.clients.allowed.cert,
            key: certs.clients.allowed.key,
          },
          (res) => {
            let body = '';
            res.on('data', (chunk) => (body += chunk));
            res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
          },
        );
        req.on('error', reject);
        req.end();
      },
    );
    expect(response.status).toBe(404);
    expect(JSON.parse(response.body)).toMatchObject({
      error: { code: 'NOT_FOUND' },
    });
  });

  it('rejects with 403 when the allowlist check fails', async () => {
    const server = await buildDeviceServer({
      env: testEnv,
      tls: testDeviceTls(),
      db: fakeDb(async () => []),
      connections: createDeviceConnections(),
      service: {
        authorizeConnection: async () => {
          throw new Error('database down');
        },
      },
    });
    try {
      await server.listen({ host: '127.0.0.1', port: 0 });
      const address = server.server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      await expect(
        connectDevice(`wss://localhost:${port}/ws`, 'allowed'),
      ).rejects.toMatchObject({ status: 403 });
    } finally {
      await server.close();
    }
  });
});
