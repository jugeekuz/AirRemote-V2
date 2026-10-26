import { randomUUID } from 'node:crypto';
import type { ServerMessage } from '@airremote/contracts';
import { encodeServerMessage } from './device-messages';

/** The part of a WebSocket the registry needs. */
export type DeviceSocket = {
  send(data: string): void;
  close(code: number, reason: string): void;
};

/** Connected devices, by device id. The only way to send a device a message. */
export type DeviceConnections = {
  /**
   * Registers a device's socket, closing any socket it already had (newest
   * wins). Returns the new connection's id.
   */
  register(deviceId: string, socket: DeviceSocket): string;
  /**
   * Forgets the device's socket (unless it has since been replaced) and
   * reports the socket's own connection closed, replaced or not.
   */
  unregister(deviceId: string, socket: DeviceSocket): void;
  /**
   * Validates and sends a message. Returns the id of the connection it went
   * over, or null when the device is not connected. Throws
   * InvalidServerMessageError for an invalid message.
   */
  send(deviceId: string, message: ServerMessage): string | null;
  isConnected(deviceId: string): boolean;
  /** Listens for closed connections; a listener that throws is ignored. */
  onConnectionClosed(
    listener: (deviceId: string, connectionId: string) => void,
  ): void;
};

export const REPLACED_CLOSE_CODE = 4000;

type Connection = { id: string; socket: DeviceSocket };

export function createDeviceConnections(): DeviceConnections {
  const current = new Map<string, Connection>();
  const ids = new WeakMap<DeviceSocket, string>();
  const listeners: Array<(deviceId: string, connectionId: string) => void> = [];

  return {
    register(deviceId, socket) {
      const previous = current.get(deviceId);
      const id = ids.get(socket) ?? randomUUID();
      ids.set(socket, id);
      current.set(deviceId, { id, socket });
      if (previous && previous.socket !== socket) {
        previous.socket.close(REPLACED_CLOSE_CODE, 'replaced');
      }
      return id;
    },

    unregister(deviceId, socket) {
      if (current.get(deviceId)?.socket === socket) current.delete(deviceId);
      const id = ids.get(socket);
      if (!id) return;
      ids.delete(socket);
      for (const listener of listeners) {
        try {
          listener(deviceId, id);
        } catch {
          // A failing listener must not break the others or the unregister.
        }
      }
    },

    send(deviceId, message) {
      // Encode first so an invalid message throws whether or not the device is online.
      const data = encodeServerMessage(message);
      const connection = current.get(deviceId);
      if (!connection) return null;
      connection.socket.send(data);
      return connection.id;
    },

    isConnected(deviceId) {
      return current.has(deviceId);
    },

    onConnectionClosed(listener) {
      listeners.push(listener);
    },
  };
}
