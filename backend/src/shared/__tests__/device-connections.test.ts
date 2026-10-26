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
  it('sends a validated message to a registered device and returns true', () => {
    const connections = createDeviceConnections();
    const socket = fakeSocket();
    connections.register('device-1', socket);

    expect(connections.send('device-1', message)).toBe(true);
    expect(socket.send).toHaveBeenCalledExactlyOnceWith(
      JSON.stringify(message),
    );
  });

  it('returns false when the device is not connected', () => {
    expect(createDeviceConnections().send('device-1', message)).toBe(false);
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
    expect(connections.send('device-1', message)).toBe(false);
  });
});
