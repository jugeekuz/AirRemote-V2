import type { TLSSocket } from 'node:tls';
import { DEVICE_SUBPROTOCOL } from '@airremote/contracts';
import websocket from '@fastify/websocket';
import type { FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import type { DeviceConnections } from '../shared/device-connections';
import type {
  AuthorizedDevice,
  DeviceMessageHandlers,
} from '../shared/device-messages';
import { attachDeviceSession, type DeviceSession } from './device-session';

declare module 'fastify' {
  interface FastifyRequest {
    /** The device behind a WebSocket upgrade, once it has been allowed. */
    device: AuthorizedDevice | null;
  }
}

export type DeviceGatewayOptions = {
  /** Decides from the client certificate's Subject CN; null or a throw rejects. */
  authorize(commonName: string): Promise<AuthorizedDevice | null>;
  handlers: DeviceMessageHandlers;
  connections: DeviceConnections;
  heartbeatIntervalMs: number;
};

const MAX_FRAME_BYTES = 16 * 1024;
const GOING_AWAY = 1001;

function requestedProtocols(request: FastifyRequest): string[] {
  const header = request.headers['sec-websocket-protocol'] ?? '';
  return header.split(',').map((protocol) => protocol.trim());
}

function peerCommonName(request: FastifyRequest): string | null {
  const socket = request.raw.socket as TLSSocket;
  // With two CN attributes Node returns an array; only a single CN identifies a device.
  const commonName: unknown = socket.getPeerCertificate().subject?.CN;
  return typeof commonName === 'string' ? commonName : null;
}

function reject(
  request: FastifyRequest,
  reply: FastifyReply,
  status: 400 | 403,
  reason: string,
  details: Record<string, unknown> = {},
) {
  request.log.warn({ reason, ...details }, 'Device connection rejected');
  return reply.code(status).header('connection', 'close').send();
}

/**
 * The only owner of device sockets: checks the subprotocol and the client
 * certificate on upgrade, then hands each socket to a device session.
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
      preClose(done) {
        for (const client of this.websocketServer.clients) {
          client.close(GOING_AWAY, 'server shutting down');
        }
        this.websocketServer.close(() => done());
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
        async preValidation(request, reply) {
          if (!requestedProtocols(request).includes(DEVICE_SUBPROTOCOL)) {
            return reject(request, reply, 400, 'unsupported subprotocol');
          }

          const commonName = peerCommonName(request);
          if (commonName === null) {
            return reject(request, reply, 403, 'no single certificate CN');
          }

          let device: AuthorizedDevice | null;
          try {
            device = await authorize(commonName);
          } catch (error) {
            request.log.error({ err: error }, 'Device authorization failed');
            device = null;
          }
          if (!device) {
            return reject(request, reply, 403, 'device not allowed', {
              commonName,
            });
          }
          request.device = device;
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
