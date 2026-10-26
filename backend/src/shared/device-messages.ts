import {
  deviceMessageSchema,
  serverMessageSchema,
  type DeviceMessage,
  type DeviceProtocolErrorCode,
  type ServerMessage,
} from '@airremote/contracts';
import type { FastifyBaseLogger } from 'fastify';
import type { z } from 'zod';

/** A device that passed mTLS and the allowlist. */
export type AuthorizedDevice = { id: string; macAddress: string };

export type DeviceMessageContext = {
  device: AuthorizedDevice;
  log: FastifyBaseLogger;
};

/** One handler per device message type; a type without a handler does not compile. */
export type DeviceMessageHandlers = {
  [T in DeviceMessage['type']]: (
    message: Extract<DeviceMessage, { type: T }>,
    ctx: DeviceMessageContext,
  ) => Promise<void>;
};

export type DecodedFrame =
  | { ok: true; message: DeviceMessage }
  | { ok: false; code: DeviceProtocolErrorCode; detail: string };

const MAX_DETAIL_LENGTH = 200;

function describeFirstIssue(error: z.ZodError): string {
  const [issue] = error.issues;
  if (!issue) return 'Message is invalid';
  const path = issue.path.join('.');
  const detail = path ? `${path}: ${issue.message}` : issue.message;
  return detail.slice(0, MAX_DETAIL_LENGTH);
}

/** Turns a raw frame from a device into a validated message, or the reason it was refused. */
export function decodeDeviceFrame(
  data: Buffer,
  isBinary: boolean,
): DecodedFrame {
  if (isBinary) {
    return {
      ok: false,
      code: 'UNSUPPORTED_FRAME',
      detail: 'Binary frames are not supported',
    };
  }

  let json: unknown;
  try {
    json = JSON.parse(data.toString('utf8'));
  } catch {
    return {
      ok: false,
      code: 'INVALID_JSON',
      detail: 'Message is not valid JSON',
    };
  }

  const result = deviceMessageSchema.safeParse(json);
  if (!result.success) {
    return {
      ok: false,
      code: 'INVALID_MESSAGE',
      detail: describeFirstIssue(result.error),
    };
  }
  return { ok: true, message: result.data };
}

/** A server message that does not match the protocol: a server bug. */
export class InvalidServerMessageError extends Error {
  override name = 'InvalidServerMessageError';
}

/** Validates a message for a device and serialises it. Throws InvalidServerMessageError. */
export function encodeServerMessage(message: ServerMessage): string {
  const result = serverMessageSchema.safeParse(message);
  if (!result.success) {
    throw new InvalidServerMessageError(
      `Refusing to send an invalid device message: ${describeFirstIssue(result.error)}`,
    );
  }
  return JSON.stringify(result.data);
}
