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
  /**
   * Closes the device's socket with 4001 "deleted" and forgets it at once, so
   * nothing more is sent over it. Its close is still reported to the
   * listeners. Returns false when the device is not connected.
   */
  disconnect(deviceId: string): boolean;
  /**
   * Listens for closed connections. A listener that throws never breaks
   * `unregister` or the other listeners; its error goes to `onListenerError`.
   */
  onConnectionClosed(
    listener: (deviceId: string, connectionId: string) => void,
  ): void;
};

export const REPLACED_CLOSE_CODE = 4000;
/** The device was deleted; it is refused until it is enrolled again. */
export const DELETED_CLOSE_CODE = 4001;

type Connection = { id: string; socket: DeviceSocket };

export type DeviceConnectionsOptions = {
  /** Called when a close listener throws. Defaults to `console.error`. */
  onListenerError?: (
    error: unknown,
    deviceId: string,
    connectionId: string,
  ) => void;
};

export function createDeviceConnections(
  options: DeviceConnectionsOptions = {},
): DeviceConnections {
  const onListenerError =
    options.onListenerError ??
    ((error, deviceId, connectionId) =>
      console.error(
        `Device connection close listener failed (device ${deviceId}, connection ${connectionId})`,
        error,
      ));
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
        } catch (error) {
          // A failing listener must not break the others or the unregister.
          onListenerError(error, deviceId, id);
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

    disconnect(deviceId) {
      const connection = current.get(deviceId);
      if (!connection) return false;
      current.delete(deviceId);
      connection.socket.close(DELETED_CLOSE_CODE, 'deleted');
      return true;
    },

    onConnectionClosed(listener) {
      listeners.push(listener);
    },
  };
}
