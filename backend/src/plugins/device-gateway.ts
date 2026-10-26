import { DEVICE_SUBPROTOCOL } from '@airremote/contracts';
import websocket from '@fastify/websocket';
import fp from 'fastify-plugin';
import type { DeviceConnections } from '../shared/device-connections';
import type {
  AuthorizedDevice,
  DeviceMessageHandlers,
} from '../shared/device-messages';
import {
  attachDeviceSession,
  closeDeviceSockets,
  type DeviceSession,
} from './device-session';
import { checkDeviceUpgrade, type AuthorizeDevice } from './device-upgrade';

declare module 'fastify' {
  interface FastifyRequest {
    /** The device behind a WebSocket upgrade, once it has been allowed. */
    device: AuthorizedDevice | null;
  }
}

export type DeviceGatewayOptions = {
  authorize: AuthorizeDevice;
  handlers: DeviceMessageHandlers;
  connections: DeviceConnections;
  heartbeatIntervalMs: number;
};

const MAX_FRAME_BYTES = 16 * 1024;
/** How long shutdown waits for devices to answer the close before cutting them off. */
const SHUTDOWN_GRACE_MS = 2_000;

/**
 * The only owner of device sockets: checks each upgrade, then hands the
 * socket to a device session and pings it on every heartbeat.
 */
export const deviceGatewayPlugin = fp<DeviceGatewayOptions>(
  async (app, { authorize, handlers, connections, heartbeatIntervalMs }) => {
    await app.register(websocket, {
      options: {
        maxPayload: MAX_FRAME_BYTES,
        handleProtocols: () => DEVICE_SUBPROTOCOL,
      },
      // `ws` protocol errors (e.g. an oversized frame) close the socket with
      // their own code and the session logs them; only a socket still open
      // (a failure in our handler) is ended here.
      errorHandler(error, socket, request) {
        if (socket.readyState !== socket.OPEN) return;
        request.log.error({ err: error }, 'Device connection failed');
        socket.terminate();
      },
      async preClose() {
        await closeDeviceSockets(
          app.websocketServer.clients,
          SHUTDOWN_GRACE_MS,
        );
        await new Promise<void>((resolve) =>
          app.websocketServer.close(() => resolve()),
        );
      },
    });

    app.decorateRequest('device', null);

    const sessions = new Set<DeviceSession>();
    const heartbeat = setInterval(() => {
      for (const session of sessions) session.heartbeat();
    }, heartbeatIntervalMs);
    heartbeat.unref();
    app.addHook('onClose', async () => clearInterval(heartbeat));

    app.get(
      '/ws',
      {
        websocket: true,
        // Fastify's automatic HEAD route would run the socket handler as an
        // HTTP handler; HEAD /ws is a 404 like any other non-upgrade path.
        exposeHeadRoute: false,
        async preValidation(request, reply) {
          const decision = await checkDeviceUpgrade(request, authorize);
          if (decision.ok) {
            request.device = decision.device;
            return;
          }
          const { status, reason, commonName } = decision;
          request.log.warn(
            { reason, commonName },
            'Device connection rejected',
          );
          return reply.code(status).header('connection', 'close').send();
        },
      },
      (socket, request) => {
        const device = request.device!;
        const session = attachDeviceSession(socket, {
          device,
          handlers,
          connections,
          log: request.log.child({ deviceId: device.id }),
        });
        sessions.add(session);
        socket.on('close', () => sessions.delete(session));
      },
    );
  },
  { name: 'device-gateway' },
);
