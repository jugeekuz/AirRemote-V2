import { createDb, devices, users, type DbHandle } from '@airremote/db';
import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, beforeEach, inject } from 'vitest';
import WebSocket from 'ws';
import type { DeviceTls } from '../../src/config/device-tls';
import { buildDeviceServer } from '../../src/device-server';
import type { DevicesService } from '../../src/features/devices/devices.service';
import { createDeviceConnections } from '../../src/shared/device-connections';
import { testEnv } from '../../src/__tests__/test-utils';
import {
  createTestDatabase,
  type TestDatabase,
} from '../../src/__tests__/test-db';
import type { TestClientName } from './device-certs.global-setup';

/** The device server refused the WebSocket upgrade with an HTTP status. */
export class UpgradeRejectedError extends Error {
  constructor(readonly status: number) {
    super(`Upgrade rejected with ${status}`);
  }
}

export type ConnectOptions = {
  /** Subprotocol to request; null requests none. Defaults to airremote.v1. */
  protocol?: string | null;
  autoPong?: boolean;
};

/** The device listener's TLS material, from the run's generated certificates. */
export function testDeviceTls(): DeviceTls {
  const certs = inject('deviceCerts');
  return {
    cert: Buffer.from(certs.serverCert),
    key: Buffer.from(certs.serverKey),
    ca: Buffer.from(certs.ca),
  };
}

/** A devices service where only the given methods work; the rest throw. */
export function fakeDevicesService(
  methods: Partial<DevicesService>,
): DevicesService {
  const unexpected = (name: string) => async () => {
    throw new Error(`fakeDevicesService: ${name} was not expected`);
  };
  return {
    authorizeConnection: unexpected('authorizeConnection'),
    issuePairingCode: unexpected('issuePairingCode'),
    enroll: unexpected('enroll'),
    ...methods,
  };
}

/** Opens a device WebSocket to `url` with one of the run's client certificates. */
export function connectDevice(
  url: string,
  cert: TestClientName | null,
  { protocol, autoPong = true }: ConnectOptions = {},
): Promise<WebSocket> {
  const certs = inject('deviceCerts');
  const client = cert ? certs.clients[cert] : undefined;
  const protocols = protocol === null ? [] : [protocol ?? 'airremote.v1'];
  const socket = new WebSocket(url, protocols, {
    ca: certs.ca,
    cert: client?.cert,
    key: client?.key,
    autoPong,
  });

  return new Promise((resolve, reject) => {
    socket.once('open', () => resolve(socket));
    socket.once('unexpected-response', (_request, response) => {
      reject(new UpgradeRejectedError(response.statusCode ?? 0));
      socket.terminate();
    });
    socket.once('error', reject);
  });
}

/** Resolves with the next message a socket receives, parsed. */
export function nextMessage(socket: WebSocket): Promise<unknown> {
  return new Promise((resolve) =>
    socket.once('message', (data) => resolve(JSON.parse(String(data)))),
  );
}

/** Resolves with the close code once the socket closes. */
export function closeCode(socket: WebSocket): Promise<number> {
  if (socket.readyState === WebSocket.CLOSED) return Promise.resolve(-1);
  return new Promise((resolve) =>
    socket.once('close', (code) => resolve(code)),
  );
}

/**
 * Starts the real device server over mTLS on a random port against the
 * calling file's own database, emptied before every test. Use it at the top
 * level of an *.e2e.ts file.
 */
export function useDeviceServer(
  options: { heartbeatIntervalMs?: number; service?: DevicesService } = {},
) {
  let database: TestDatabase | undefined;
  let handle: DbHandle | undefined;
  let server: FastifyInstance | undefined;
  let url: string | undefined;
  const opened: WebSocket[] = [];

  beforeAll(async () => {
    database = await createTestDatabase();
    handle = createDb(database.url);
    server = await buildDeviceServer({
      env: testEnv,
      tls: testDeviceTls(),
      db: handle,
      connections: createDeviceConnections(),
      ...options,
    });
    await server.listen({ host: '127.0.0.1', port: 0 });
    const address = server.server.address();
    if (!address || typeof address === 'string') throw new Error('no port');
    url = `wss://localhost:${address.port}/ws`;
  });

  beforeEach(async () => {
    await database?.truncate();
  });

  afterEach(() => {
    for (const socket of opened.splice(0)) socket.terminate();
  });

  afterAll(async () => {
    await server?.close();
    await handle?.close();
    await database?.drop();
  });

  return {
    get url() {
      if (!url) throw new Error('useDeviceServer: server not started yet');
      return url;
    },
    get server() {
      if (!server) throw new Error('useDeviceServer: server not started yet');
      return server;
    },
    /** Inserts a user and a device with this MAC address; returns the device id. */
    async allowDevice(macAddress: string): Promise<string> {
      if (!handle) throw new Error('useDeviceServer: database not ready yet');
      const [user] = await handle.db
        .insert(users)
        .values({
          email: `${macAddress.replaceAll(':', '')}@example.com`,
          firstName: 'Device',
          lastName: 'Owner',
          passwordHash: 'hash',
          passwordSalt: 'salt',
        })
        .returning();
      const [device] = await handle.db
        .insert(devices)
        .values({ userId: user!.id, macAddress, name: 'Test device' })
        .returning();
      return device!.id;
    },
    /** Connects with a client certificate; the socket is closed after the test. */
    async connect(
      cert: TestClientName | null,
      connectOptions?: ConnectOptions,
    ) {
      if (!url) throw new Error('useDeviceServer: server not started yet');
      const socket = await connectDevice(url, cert, connectOptions);
      opened.push(socket);
      return socket;
    },
  };
}
