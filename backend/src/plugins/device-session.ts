import type { DeviceMessage } from '@airremote/contracts';
import type { FastifyBaseLogger } from 'fastify';
import type {
  DeviceConnections,
  DeviceSocket,
} from '../shared/device-connections';
import {
  decodeDeviceFrame,
  encodeServerMessage,
  type AuthorizedDevice,
  type DeviceMessageContext,
  type DeviceMessageHandlers,
} from '../shared/device-messages';

/** The part of a `ws` WebSocket a session uses, so this file does not import `ws`. */
export type SessionSocket = DeviceSocket & {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(event: string, listener: (...args: any[]) => void): unknown;
  ping(): void;
  terminate(): void;
  readonly readyState: number;
};

export type DeviceSession = {
  /** Pings the socket, or terminates it when it missed the previous ping. */
  heartbeat(): void;
  readonly closed: boolean;
};

/** Consecutive bad frames after which the socket is closed. */
export const MAX_BAD_FRAMES = 5;

const OPEN = 1;
const POLICY_VIOLATION = 1008;

type RawData = Buffer | ArrayBuffer | Buffer[];

function toBuffer(data: RawData): Buffer {
  if (Array.isArray(data)) return Buffer.concat(data);
  return Buffer.isBuffer(data) ? data : Buffer.from(data);
}

/**
 * Runs one device's connection: registers it, validates every frame,
 * dispatches valid messages, answers bad frames, and answers heartbeats.
 */
export function attachDeviceSession(
  socket: SessionSocket,
  deps: {
    device: AuthorizedDevice;
    handlers: DeviceMessageHandlers;
    connections: DeviceConnections;
    log: FastifyBaseLogger;
  },
): DeviceSession {
  const { device, handlers, connections, log } = deps;
  const ctx: DeviceMessageContext = { device, log };
  let badFrames = 0;
  let alive = true;
  let closed = false;

  connections.register(device.id, socket);
  log.info(
    { deviceId: device.id, macAddress: device.macAddress },
    'Device connected',
  );

  function dispatch(message: DeviceMessage) {
    const handler = handlers[message.type] as (
      message: DeviceMessage,
      ctx: DeviceMessageContext,
    ) => Promise<void>;
    const onError = (error: unknown) =>
      log.error(
        { err: error, type: message.type },
        'Device message handler failed',
      );
    try {
      handler(message, ctx).catch(onError);
    } catch (error) {
      onError(error);
    }
  }

  socket.on('message', (data: RawData, isBinary: boolean) => {
    const frame = decodeDeviceFrame(toBuffer(data), isBinary);
    if (frame.ok) {
      badFrames = 0;
      dispatch(frame.message);
      return;
    }

    badFrames += 1;
    log.warn(
      { code: frame.code, detail: frame.detail },
      'Device sent a bad frame',
    );
    socket.send(
      encodeServerMessage({
        type: 'error',
        code: frame.code,
        message: frame.detail,
      }),
    );
    if (badFrames >= MAX_BAD_FRAMES) {
      socket.close(POLICY_VIOLATION, 'too many invalid messages');
    }
  });

  socket.on('pong', () => {
    alive = true;
  });

  // Without a listener, a `ws` error (e.g. an oversized frame) would crash the process.
  socket.on('error', (error: Error) => {
    log.warn({ err: error }, 'Device socket error');
  });

  socket.on('close', (code: number) => {
    closed = true;
    connections.unregister(device.id, socket);
    log.info({ code }, 'Device disconnected');
  });

  return {
    heartbeat() {
      if (closed || socket.readyState !== OPEN) return;
      if (!alive) {
        socket.terminate();
        return;
      }
      alive = false;
      socket.ping();
    },
    get closed() {
      return closed;
    },
  };
}
