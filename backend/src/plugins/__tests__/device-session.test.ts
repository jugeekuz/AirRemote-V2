import { EventEmitter } from 'node:events';
import type { FastifyBaseLogger } from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createDeviceConnections,
  type DeviceConnections,
} from '../../shared/device-connections';
import type { DeviceMessageHandlers } from '../../shared/device-messages';
import { attachDeviceSession, closeDeviceSockets } from '../device-session';

class FakeSocket extends EventEmitter {
  readyState = 1;
  send = vi.fn<(data: string) => void>();
  close = vi.fn<(code: number, reason: string) => void>();
  ping = vi.fn<() => void>();
  terminate = vi.fn<() => void>();

  /** The server messages sent so far, parsed. */
  replies() {
    return this.send.mock.calls.map(([data]) => JSON.parse(data));
  }
}

const device = { id: 'device-1', macAddress: 'aa:bb:cc:dd:ee:01' };
const text = (value: unknown) => Buffer.from(JSON.stringify(value));
const deviceError = {
  type: 'error',
  code: 'READ_TIMEOUT',
  message: 'IR receiver timed out',
};

let socket: FakeSocket;
let connections: DeviceConnections;
let log: {
  info: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
};
let handlers: { error: ReturnType<typeof vi.fn> };

function attach(target: FakeSocket = socket) {
  return attachDeviceSession(target, {
    device,
    handlers: handlers as unknown as DeviceMessageHandlers,
    connections,
    log: log as unknown as FastifyBaseLogger,
  });
}

function sendBadFrames(count: number) {
  for (let i = 0; i < count; i += 1) {
    socket.emit('message', Buffer.from('{nope'), false);
  }
}

beforeEach(() => {
  socket = new FakeSocket();
  connections = createDeviceConnections();
  log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  handlers = { error: vi.fn(async () => {}) };
});

describe('device session', () => {
  it('registers the socket for the device on attach', () => {
    attach();
    expect(connections.isConnected(device.id)).toBe(true);
  });

  it('dispatches a valid message to its handler with the device context', () => {
    attach();
    socket.emit('message', text(deviceError), false);
    expect(handlers.error).toHaveBeenCalledExactlyOnceWith(
      deviceError,
      expect.objectContaining({ device }),
    );
    expect(socket.send).not.toHaveBeenCalled();
  });

  it('replies UNSUPPORTED_FRAME to a binary frame', () => {
    attach();
    socket.emit('message', text(deviceError), true);
    expect(socket.replies()).toEqual([
      {
        type: 'error',
        code: 'UNSUPPORTED_FRAME',
        message: 'Binary frames are not supported',
      },
    ]);
  });

  it('replies INVALID_JSON to text that is not JSON', () => {
    attach();
    sendBadFrames(1);
    expect(socket.replies()).toEqual([
      {
        type: 'error',
        code: 'INVALID_JSON',
        message: 'Message is not valid JSON',
      },
    ]);
  });

  it('replies INVALID_MESSAGE to a message that fails the schema', () => {
    attach();
    socket.emit('message', text({ type: 'hello' }), false);
    expect(socket.replies()).toEqual([
      expect.objectContaining({ type: 'error', code: 'INVALID_MESSAGE' }),
    ]);
    expect(handlers.error).not.toHaveBeenCalled();
  });

  it('accepts a message split into fragments', () => {
    attach();
    const [first, second] = [
      Buffer.from('{"type":"error","code":'),
      Buffer.from('"READ_TIMEOUT","message":"IR receiver timed out"}'),
    ];
    socket.emit('message', [first, second], false);
    expect(handlers.error).toHaveBeenCalledOnce();
  });

  it('closes with 1008 after 5 bad frames in a row', () => {
    attach();
    sendBadFrames(4);
    expect(socket.close).not.toHaveBeenCalled();
    sendBadFrames(1);
    expect(socket.close).toHaveBeenCalledExactlyOnceWith(
      1008,
      'too many invalid messages',
    );
    expect(socket.send).toHaveBeenCalledTimes(5);
  });

  it('resets the bad-frame count after a valid frame', () => {
    attach();
    sendBadFrames(4);
    socket.emit('message', text(deviceError), false);
    sendBadFrames(4);
    expect(socket.close).not.toHaveBeenCalled();
  });

  it('keeps the socket open when a handler rejects', async () => {
    handlers.error.mockRejectedValueOnce(new Error('handler failed'));
    attach();
    socket.emit('message', text(deviceError), false);
    await vi.waitFor(() => expect(log.error).toHaveBeenCalledOnce());
    expect(socket.close).not.toHaveBeenCalled();
    expect(socket.send).not.toHaveBeenCalled();
  });

  it('keeps the socket open when a handler throws synchronously', () => {
    handlers.error.mockImplementationOnce(() => {
      throw new Error('handler failed');
    });
    attach();
    expect(() =>
      socket.emit('message', text(deviceError), false),
    ).not.toThrow();
    expect(log.error).toHaveBeenCalledOnce();
    expect(socket.close).not.toHaveBeenCalled();
    expect(socket.send).not.toHaveBeenCalled();
  });

  it('unregisters on close', () => {
    attach();
    socket.emit('close', 1000);
    expect(connections.isConnected(device.id)).toBe(false);
  });

  it('does not unregister a newer socket when a replaced one closes', () => {
    const older = socket;
    const newer = new FakeSocket();
    attach(older);
    attach(newer);
    older.emit('close', 4000);

    expect(connections.isConnected(device.id)).toBe(true);
    connections.send(device.id, {
      type: 'error',
      code: 'INVALID_JSON',
      message: 'Message is not valid JSON',
    });
    expect(newer.send).toHaveBeenCalledOnce();
  });

  it('reports a replaced socket closing with its own connection id', () => {
    const older = socket;
    const newer = new FakeSocket();
    const closed = vi.fn();
    connections.onConnectionClosed(closed);
    attach(older);
    attach(newer);
    older.emit('close', 4000);

    expect(closed).toHaveBeenCalledOnce();
    const [deviceId, olderId] = closed.mock.calls[0]!;
    expect(deviceId).toBe(device.id);
    expect(
      connections.send(device.id, {
        type: 'error',
        code: 'INVALID_JSON',
        message: 'x',
      }),
    ).not.toBe(olderId);
  });

  it('pings on heartbeat and terminates a socket that missed the previous pong', () => {
    const session = attach();
    session.heartbeat();
    expect(socket.ping).toHaveBeenCalledOnce();
    session.heartbeat();
    expect(socket.terminate).toHaveBeenCalledOnce();
  });

  it('keeps a socket that answered the ping', () => {
    const session = attach();
    session.heartbeat();
    socket.emit('pong');
    session.heartbeat();
    expect(socket.ping).toHaveBeenCalledTimes(2);
    expect(socket.terminate).not.toHaveBeenCalled();
  });

  it('does nothing on heartbeat after the socket closed', () => {
    const session = attach();
    socket.emit('close', 1000);
    socket.readyState = 3;
    socket.ping.mockImplementation(() => {
      throw new Error('WebSocket is not open');
    });

    expect(() => session.heartbeat()).not.toThrow();
    expect(socket.ping).not.toHaveBeenCalled();
    expect(socket.terminate).not.toHaveBeenCalled();
    expect(session.closed).toBe(true);
  });

  it('logs socket errors instead of throwing', () => {
    attach();
    expect(() =>
      socket.emit('error', new Error('Max payload size exceeded')),
    ).not.toThrow();
    expect(log.warn).toHaveBeenCalled();
  });
});

describe('closeDeviceSockets', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    return () => vi.useRealTimers();
  });

  it('asks every socket to close with 1001 and returns once they have', async () => {
    const sockets = [new FakeSocket(), new FakeSocket()];
    for (const each of sockets) {
      each.close.mockImplementation((code) => each.emit('close', code));
    }

    await closeDeviceSockets(sockets, 2_000);

    for (const each of sockets) {
      expect(each.close).toHaveBeenCalledWith(1001, 'server shutting down');
    }
  });

  it('terminates a socket that has not closed after the grace period', async () => {
    const closing = closeDeviceSockets([socket], 2_000);

    await vi.advanceTimersByTimeAsync(1_999);
    expect(socket.terminate).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await closing;
    expect(socket.terminate).toHaveBeenCalled();
  });

  it('does not ask a socket that is already closed', async () => {
    socket.readyState = 3;

    await closeDeviceSockets([socket], 2_000);

    expect(socket.close).not.toHaveBeenCalled();
  });
});
