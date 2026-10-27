import { request as httpsRequest } from 'node:https';
import {
  createDb,
  devices,
  users,
  type Database,
  type Device,
  type DbHandle,
} from '@airremote/db';
import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, beforeEach, inject } from 'vitest';
import WebSocket from 'ws';
import type { DeviceTls } from '../../src/config/device-tls';
import { buildApp } from '../../src/app';
import { buildDeviceServer } from '../../src/device-server';
import type { DeviceCommandTimings } from '../../src/features/device-commands/device-commands.service';
import type { DevicesService } from '../../src/features/devices/devices.service';
import {
  createDeviceConnections,
  type DeviceConnections,
} from '../../src/shared/device-connections';
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
    list: unexpected('list'),
    recordFirmwareVersion: unexpected('recordFirmwareVersion'),
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

/**
 * Sends a POST with no body to the device listener at `origin`, presenting one
 * of the run's client certificates. Rejects when the TLS handshake fails.
 */
export function postToDevice(
  origin: string,
  path: string,
  cert: TestClientName | null,
): Promise<{ status: number; body: unknown }> {
  const certs = inject('deviceCerts');
  const client = cert ? certs.clients[cert] : undefined;
  return new Promise((resolve, reject) => {
    const request = httpsRequest(
      new URL(path, origin),
      {
        method: 'POST',
        ca: certs.ca,
        cert: client?.cert,
        key: client?.key,
        agent: false,
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('error', reject);
        response.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          resolve({
            status: response.statusCode ?? 0,
            body: text ? JSON.parse(text) : null,
          });
        });
      },
    );
    request.on('error', reject);
    request.end();
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
 * calling file's own database, emptied before every test. With `api`, the
 * HTTP API runs on the same database too. Use it at the top level of an
 * *.e2e.ts file.
 */
export function useDeviceServer({
  api = false,
  deviceCommandTimings,
  ...options
}: {
  heartbeatIntervalMs?: number;
  service?: DevicesService;
  api?: boolean;
  /** Shortens the API's device reads and command lives; only with `api`. */
  deviceCommandTimings?: DeviceCommandTimings;
} = {}) {
  let database: TestDatabase | undefined;
  let handle: DbHandle | undefined;
  let connections: DeviceConnections | undefined;
  let server: FastifyInstance | undefined;
  let url: string | undefined;
  let origin: string | undefined;
  let apiApp: FastifyInstance | undefined;
  let apiUrl: string | undefined;
  const opened: WebSocket[] = [];

  beforeAll(async () => {
    database = await createTestDatabase();
    handle = createDb(database.url);
    // One registry, as in server.ts, so the API reaches connected devices.
    connections = createDeviceConnections();
    server = await buildDeviceServer({
      env: testEnv,
      tls: testDeviceTls(),
      db: handle,
      connections,
      ...options,
    });
    await server.listen({ host: '127.0.0.1', port: 0 });
    const address = server.server.address();
    if (!address || typeof address === 'string') throw new Error('no port');
    origin = `https://localhost:${address.port}`;
    url = `wss://localhost:${address.port}/ws`;
    if (api) {
      apiApp = await buildApp({
        env: testEnv,
        db: handle,
        connections,
        deviceCommandTimings,
      });
      apiUrl = await apiApp.listen({ host: '127.0.0.1', port: 0 });
    }
  });

  beforeEach(async () => {
    await database?.truncate();
  });

  afterEach(() => {
    for (const socket of opened.splice(0)) socket.terminate();
  });

  afterAll(async () => {
    await server?.close();
    await apiApp?.close();
    await handle?.close();
    await database?.drop();
  });

  return {
    get url() {
      if (!url) throw new Error('useDeviceServer: server not started yet');
      return url;
    },
    /** The API's base URL; only with `api: true`. */
    get apiUrl() {
      if (!apiUrl) throw new Error('useDeviceServer: started without api');
      return apiUrl;
    },
    get server() {
      if (!server) throw new Error('useDeviceServer: server not started yet');
      return server;
    },
    /** The connected devices, shared by the device server and the API. */
    get connections(): DeviceConnections {
      if (!connections) {
        throw new Error('useDeviceServer: server not started yet');
      }
      return connections;
    },
    /** The servers' database, for seeding and checking rows. */
    get db(): Database {
      if (!handle) throw new Error('useDeviceServer: database not ready yet');
      return handle.db;
    },
    /** The database's URL, e.g. to open a second connection to it. */
    get databaseUrl(): string {
      if (!database) throw new Error('useDeviceServer: database not ready yet');
      return database.url;
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
    /** The device's row, e.g. to check what it reported; null if there is none. */
    async findDevice(deviceId: string): Promise<Device | null> {
      if (!handle) throw new Error('useDeviceServer: database not ready yet');
      const rows = await handle.db.select().from(devices);
      return rows.find((row) => row.id === deviceId) ?? null;
    },
    /** POSTs to the device listener with a client certificate. */
    post(path: string, cert: TestClientName | null) {
      if (!origin) throw new Error('useDeviceServer: server not started yet');
      return postToDevice(origin, path, cert);
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
