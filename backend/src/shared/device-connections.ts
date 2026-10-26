import type { ServerMessage } from '@airremote/contracts';
import { encodeServerMessage } from './device-messages';

/** The part of a WebSocket the registry needs. */
export type DeviceSocket = {
  send(data: string): void;
  close(code: number, reason: string): void;
};

/** Connected devices, by device id. The only way to send a device a message. */
export type DeviceConnections = {
  /** Registers a device's socket, closing any socket it already had (newest wins). */
  register(deviceId: string, socket: DeviceSocket): void;
  /** Forgets the device's socket, unless it has since been replaced. */
  unregister(deviceId: string, socket: DeviceSocket): void;
  /**
   * Validates and sends a message. Returns false when the device is not
   * connected. Throws InvalidServerMessageError for an invalid message.
   */
  send(deviceId: string, message: ServerMessage): boolean;
  isConnected(deviceId: string): boolean;
};

export const REPLACED_CLOSE_CODE = 4000;

export function createDeviceConnections(): DeviceConnections {
  const sockets = new Map<string, DeviceSocket>();

  return {
    register(deviceId, socket) {
      const previous = sockets.get(deviceId);
      sockets.set(deviceId, socket);
      if (previous && previous !== socket) {
        previous.close(REPLACED_CLOSE_CODE, 'replaced');
      }
    },

    unregister(deviceId, socket) {
      if (sockets.get(deviceId) === socket) sockets.delete(deviceId);
    },

    send(deviceId, message) {
      // Encode first so an invalid message throws whether or not the device is online.
      const data = encodeServerMessage(message);
      const socket = sockets.get(deviceId);
      if (!socket) return false;
      socket.send(data);
      return true;
    },

    isConnected(deviceId) {
      return sockets.has(deviceId);
    },
  };
}
