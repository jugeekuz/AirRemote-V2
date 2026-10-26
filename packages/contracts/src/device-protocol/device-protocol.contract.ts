import { z } from 'zod';

/** WebSocket subprotocol devices must request. A new version is a new name. */
export const DEVICE_SUBPROTOCOL = 'airremote.v1';

/** Why the server refused a frame a device sent. */
export const deviceProtocolErrorCodeSchema = z.enum([
  'INVALID_JSON',
  'INVALID_MESSAGE',
  'UNSUPPORTED_FRAME',
]);

export type DeviceProtocolErrorCode = z.infer<
  typeof deviceProtocolErrorCodeSchema
>;

/** Every message a device may send to the server. Unknown keys are rejected. */
export const deviceMessageSchema = z.discriminatedUnion('type', [
  /** The device reports a failure on its side. */
  z.strictObject({
    type: z.literal('error'),
    message: z.string().min(1).max(200),
  }),
]);

export type DeviceMessage = z.infer<typeof deviceMessageSchema>;

/** Every message the server may send to a device. Unknown keys are rejected. */
export const serverMessageSchema = z.discriminatedUnion('type', [
  /** The server refused the device's last frame. */
  z.strictObject({
    type: z.literal('error'),
    code: deviceProtocolErrorCodeSchema,
    message: z.string().min(1).max(200),
  }),
]);

export type ServerMessage = z.infer<typeof serverMessageSchema>;
