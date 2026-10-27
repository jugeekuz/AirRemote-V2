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

/** Why a device could not do what it was asked, or what went wrong on it. */
export const deviceErrorCodeSchema = z.enum([
  /** No IR code arrived within the read's timeout. */
  'READ_TIMEOUT',
  /** The code was longer than the device's capture buffer. */
  'CAPTURE_TOO_LONG',
  /** The device is still running another command. */
  'BUSY',
  /** The device could not use a command the server sent. */
  'INVALID_COMMAND',
  /** The device could not transmit the IR signal. */
  'SEND_FAILED',
  'INTERNAL',
]);

export type DeviceErrorCode = z.infer<typeof deviceErrorCodeSchema>;

/** Matches a command to its reply. */
const commandId = z.uuid();

/**
 * A raw IR signal: durations in microseconds, alternating carrier on and off,
 * starting with on, replayed at 38 kHz. A `0` is the spacer IRremoteESP8266
 * puts inside a gap longer than 65535 µs. The same rules as `buttons.timings_us`.
 */
export const irTimingsSchema = z
  .array(z.number().int().min(0).max(65_535))
  .min(1)
  .max(2048);

/**
 * The firmware a device runs: `MAJOR.MINOR.PATCH` with an optional
 * `-suffix`, at most 31 characters (ESP-IDF's app version field is 32 bytes).
 */
export const firmwareVersionSchema = z
  .string()
  .max(31)
  .regex(
    /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/,
    'must look like 1.2.3 or 1.2.3-beta.1',
  );

/** Every message a device may send to the server. Unknown keys are rejected. */
export const deviceMessageSchema = z.discriminatedUnion('type', [
  /**
   * Sent after connecting: what the device is running. A later hello replaces
   * the stored version. Not a command; no reply.
   */
  z.strictObject({
    type: z.literal('hello'),
    firmwareVersion: firmwareVersionSchema,
  }),
  /** The code a device read, answering `readIr`. */
  z.strictObject({
    type: z.literal('readIrResult'),
    commandId,
    timingsUs: irTimingsSchema,
  }),
  /** The device transmitted the code of a `sendIr`. */
  z.strictObject({ type: z.literal('sendIrResult'), commandId }),
  /** A failure on the device; `commandId` names the command it answers, if any. */
  z.strictObject({
    type: z.literal('error'),
    code: deviceErrorCodeSchema,
    commandId: commandId.optional(),
    message: z.string().min(1).max(200).optional(),
  }),
]);

export type DeviceMessage = z.infer<typeof deviceMessageSchema>;

/** Every message the server may send to a device. Unknown keys are rejected. */
export const serverMessageSchema = z.discriminatedUnion('type', [
  /** Listen for one IR code for up to `timeoutMs`; answered by `readIrResult` or `error`. */
  z.strictObject({
    type: z.literal('readIr'),
    commandId,
    timeoutMs: z.number().int().min(1_000).max(60_000),
  }),
  /** Transmit one IR signal; answered by `sendIrResult` or `error`. */
  z.strictObject({
    type: z.literal('sendIr'),
    commandId,
    timingsUs: irTimingsSchema,
  }),
  /** The server refused the device's last frame. */
  z.strictObject({
    type: z.literal('error'),
    code: deviceProtocolErrorCodeSchema,
    message: z.string().min(1).max(200),
  }),
]);

export type ServerMessage = z.infer<typeof serverMessageSchema>;
