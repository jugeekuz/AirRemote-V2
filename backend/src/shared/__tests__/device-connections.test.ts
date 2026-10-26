import type { ServerMessage } from '@airremote/contracts';
import { describe, expect, it, vi } from 'vitest';
import { createDeviceConnections } from '../device-connections';

const fakeSocket = () => ({ send: vi.fn(), close: vi.fn() });

const message: ServerMessage = {
  type: 'error',
  code: 'INVALID_JSON',
  message: 'Message is not valid JSON',
};

describe('device connections', () => {
  it('sends a validated message to a registered device and returns the connection id', () => {
    const connections = createDeviceConnections();
    const socket = fakeSocket();
    const id = connections.register('device-1', socket);

    expect(connections.send('device-1', message)).toBe(id);
    expect(socket.send).toHaveBeenCalledExactlyOnceWith(
      JSON.stringify(message),
    );
  });

  it('returns null when the device is not connected', () => {
    expect(createDeviceConnections().send('device-1', message)).toBeNull();
  });

  it('throws and sends nothing when the message is invalid', () => {
    const connections = createDeviceConnections();
    const socket = fakeSocket();
    connections.register('device-1', socket);

    expect(() =>
      connections.send('device-1', {
        ...message,
        code: 'NOPE',
      } as unknown as ServerMessage),
    ).toThrow();
    expect(socket.send).not.toHaveBeenCalled();
  });

  it('closes the previous socket with 4000 "replaced" when a device registers again', () => {
    const connections = createDeviceConnections();
    const first = fakeSocket();
    const second = fakeSocket();
    connections.register('device-1', first);
    connections.register('device-1', second);

    expect(first.close).toHaveBeenCalledExactlyOnceWith(4000, 'replaced');
    expect(connections.isConnected('device-1')).toBe(true);
    connections.send('device-1', message);
    expect(second.send).toHaveBeenCalledOnce();
    expect(first.send).not.toHaveBeenCalled();
  });

  it('ignores an unregister for a socket that was already replaced', () => {
    const connections = createDeviceConnections();
    const first = fakeSocket();
    const second = fakeSocket();
    connections.register('device-1', first);
    connections.register('device-1', second);
    connections.unregister('device-1', first);

    expect(connections.isConnected('device-1')).toBe(true);
    connections.send('device-1', message);
    expect(second.send).toHaveBeenCalledOnce();
  });

  it('unregisters the current socket', () => {
    const connections = createDeviceConnections();
    const socket = fakeSocket();
    connections.register('device-1', socket);
    connections.unregister('device-1', socket);

    expect(connections.isConnected('device-1')).toBe(false);
    expect(connections.send('device-1', message)).toBeNull();
  });

  it('gives every registration a distinct UUID', () => {
    const connections = createDeviceConnections();
    const a = connections.register('device-1', fakeSocket());
    const b = connections.register('device-1', fakeSocket());
    const c = connections.register('device-2', fakeSocket());

    expect(new Set([a, b, c]).size).toBe(3);
    expect(a).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it('send returns the id of the current connection after a replacement', () => {
    const connections = createDeviceConnections();
    connections.register('device-1', fakeSocket());
    const second = connections.register('device-1', fakeSocket());

    expect(connections.send('device-1', message)).toBe(second);
  });

  it('notifies listeners with the closing socket own id, even when replaced', () => {
    const connections = createDeviceConnections();
    const listener = vi.fn();
    connections.onConnectionClosed(listener);
    const first = fakeSocket();
    const second = fakeSocket();
    const firstId = connections.register('device-1', first);
    const secondId = connections.register('device-1', second);

    connections.unregister('device-1', first);
    expect(listener).toHaveBeenCalledExactlyOnceWith('device-1', firstId);
    expect(connections.isConnected('device-1')).toBe(true);
    expect(connections.send('device-1', message)).toBe(secondId);

    connections.unregister('device-1', second);
    expect(listener).toHaveBeenLastCalledWith('device-1', secondId);
  });

  it('does not notify twice for the same socket', () => {
    const connections = createDeviceConnections();
    const listener = vi.fn();
    connections.onConnectionClosed(listener);
    const socket = fakeSocket();
    connections.register('device-1', socket);
    connections.unregister('device-1', socket);
    connections.unregister('device-1', socket);

    expect(listener).toHaveBeenCalledOnce();
  });

  it('still unregisters and notifies the other listeners when one throws', () => {
    const connections = createDeviceConnections();
    const after = vi.fn();
    connections.onConnectionClosed(() => {
      throw new Error('boom');
    });
    connections.onConnectionClosed(after);
    const socket = fakeSocket();
    connections.register('device-1', socket);

    expect(() => connections.unregister('device-1', socket)).not.toThrow();
    expect(connections.isConnected('device-1')).toBe(false);
    expect(after).toHaveBeenCalledOnce();
  });

  it('reports a throwing listener to onListenerError with the ids', () => {
    const onListenerError = vi.fn();
    const connections = createDeviceConnections({ onListenerError });
    const boom = new Error('boom');
    const after = vi.fn();
    connections.onConnectionClosed(() => {
      throw boom;
    });
    connections.onConnectionClosed(after);
    const first = fakeSocket();
    const firstId = connections.register('device-1', first);
    connections.register('device-1', fakeSocket());

    connections.unregister('device-1', first);

    expect(onListenerError).toHaveBeenCalledExactlyOnceWith(
      boom,
      'device-1',
      firstId,
    );
    expect(after).toHaveBeenCalledOnce();
    expect(connections.isConnected('device-1')).toBe(true);
  });

  it('logs a listener error with console.error by default', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const connections = createDeviceConnections();
    connections.onConnectionClosed(() => {
      throw new Error('boom');
    });
    const socket = fakeSocket();
    connections.register('device-1', socket);
    connections.unregister('device-1', socket);

    expect(spy).toHaveBeenCalledOnce();
    spy.mockRestore();
  });
});
