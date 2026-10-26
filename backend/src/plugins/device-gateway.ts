import { DEVICE_SUBPROTOCOL } from '@airremote/contracts';
import websocket, { type WebSocket } from '@fastify/websocket';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
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
const SHUTDOWN_GRACE_MS = 2_000;

/**
 * The only owner of device sockets: checks each upgrade, then hands the
 * socket to a device session and pings it on every heartbeat.
 */
export const deviceGatewayPlugin = fp<DeviceGatewayOptions>(
  async (app, options) => {
    await registerWebsocketServer(app);
    app.decorateRequest('device', null);

    const heartbeat = startHeartbeat(app, options.heartbeatIntervalMs);

    app.get(
      '/ws',
      {
        websocket: true,
        // The automatic HEAD route would run the socket handler as plain HTTP.
        exposeHeadRoute: false,
        preValidation: requireAuthorizedDevice(options.authorize),
      },
      (socket, request) => {
        const session = openDeviceSession(socket, request, options);
        heartbeat.track(session, socket);
      },
    );
  },
  { name: 'device-gateway' },
);

async function registerWebsocketServer(app: FastifyInstance) {
  await app.register(websocket, {
    options: {
      maxPayload: MAX_FRAME_BYTES,
      handleProtocols: () => DEVICE_SUBPROTOCOL,
    },
    errorHandler: terminateOnHandlerError,
    preClose: () => closeAllDevices(app),
  });
}

/** `ws` protocol errors have already closed the socket; only end one still open. */
function terminateOnHandlerError(
  error: Error,
  socket: WebSocket,
  request: FastifyRequest,
) {
  if (socket.readyState !== socket.OPEN) return;
  request.log.error({ err: error }, 'Device connection failed');
  socket.terminate();
}

async function closeAllDevices(app: FastifyInstance) {
  await closeDeviceSockets(app.websocketServer.clients, SHUTDOWN_GRACE_MS);
  await new Promise<void>((resolve) =>
    app.websocketServer.close(() => resolve()),
  );
}

function requireAuthorizedDevice(authorize: AuthorizeDevice) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const decision = await checkDeviceUpgrade(request, authorize);
    if (decision.ok) {
      request.device = decision.device;
      return;
    }

    const { status, reason, commonName } = decision;
    request.log.warn({ reason, commonName }, 'Device connection rejected');
    return reply.code(status).header('connection', 'close').send();
  };
}

function openDeviceSession(
  socket: WebSocket,
  request: FastifyRequest,
  { handlers, connections }: DeviceGatewayOptions,
): DeviceSession {
  const { device } = request;
  if (!device) {
    throw new Error('Device socket opened without an authorized device');
  }

  return attachDeviceSession(socket, {
    device,
    handlers,
    connections,
    log: request.log.child({ deviceId: device.id }),
  });
}

function startHeartbeat(app: FastifyInstance, intervalMs: number) {
  const sessions = new Set<DeviceSession>();

  const timer = setInterval(() => {
    for (const session of sessions) session.heartbeat();
  }, intervalMs);
  timer.unref();
  app.addHook('onClose', async () => clearInterval(timer));

  return {
    track(session: DeviceSession, socket: WebSocket) {
      sessions.add(session);
      socket.once('close', () => sessions.delete(session));
    },
  };
}
