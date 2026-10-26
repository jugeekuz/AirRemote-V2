import type { DbHandle } from '@airremote/db';
import Fastify, { type FastifyInstance } from 'fastify';
import type { DeviceTls } from './config/device-tls';
import type { Env } from './config/env';
import { loggerOptions } from './config/logger';
import { createDevicesRepository } from './features/devices/devices.repository';
import {
  createDevicesService,
  type DevicesService,
} from './features/devices/devices.service';
import { devicesDeviceRoutes } from './features/devices/devices.device-routes';
import { createDevicesSocketHandlers } from './features/devices/devices.socket';
import { deviceGatewayPlugin } from './plugins/device-gateway';
import { errorHandlerPlugin } from './plugins/error-handler';
import { zodPlugin } from './plugins/zod';
import type { DeviceConnections } from './shared/device-connections';

export type BuildDeviceServerOptions = {
  env: Env;
  tls: DeviceTls;
  /** Shared with the API; the caller closes it. */
  db: DbHandle;
  connections: DeviceConnections;
  /** How often connected devices are pinged. */
  heartbeatIntervalMs?: number;
  /** Overrides the devices service, e.g. with a fake in tests. */
  service?: DevicesService;
};

/**
 * Creates the device listener without listening: HTTPS that only accepts
 * clients with a certificate signed by the device CA, serving the WebSocket
 * route and the pairing-code route.
 */
export async function buildDeviceServer({
  env,
  tls,
  db,
  connections,
  heartbeatIntervalMs = 30_000,
  service,
}: BuildDeviceServerOptions): Promise<FastifyInstance> {
  const server = Fastify({
    logger: loggerOptions(env),
    https: { ...tls, requestCert: true, rejectUnauthorized: true },
  });

  // A client rejected during the TLS handshake (no certificate, another CA)
  // never reaches HTTP; log it so a misconfigured device is visible.
  server.server.on('tlsClientError', (error: NodeJS.ErrnoException, socket) => {
    server.log.warn(
      {
        code: error.code,
        reason: error.message,
        remoteAddress: socket.remoteAddress,
      },
      'Device TLS handshake failed',
    );
  });

  const devices =
    service ??
    createDevicesService({
      repository: createDevicesRepository(db.db),
      pairingCodeSecret: env.PAIRING_CODE_SECRET,
    });

  await server.register(zodPlugin);
  await server.register(errorHandlerPlugin);
  await server.register(deviceGatewayPlugin, {
    authorize: (commonName) => devices.authorizeConnection(commonName),
    handlers: createDevicesSocketHandlers(),
    connections,
    heartbeatIntervalMs,
  });
  await server.register(devicesDeviceRoutes, { service: devices });

  return server;
}
