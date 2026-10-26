import { describe, expect, it } from 'vitest';
import {
  DEVICE_SUBPROTOCOL,
  deviceMessageSchema,
  serverMessageSchema,
} from '../device-protocol.contract';

describe('deviceMessageSchema', () => {
  it('accepts a device error report', () => {
    const message = { type: 'error', message: 'IR receiver timed out' };
    expect(deviceMessageSchema.parse(message)).toEqual(message);
  });

  it('rejects unknown keys, unknown types, and empty or over-200-character messages', () => {
    for (const bad of [
      { type: 'error', message: 'x', extra: 1 },
      { type: 'hello' },
      { type: 'error', message: '' },
      { type: 'error', message: 'x'.repeat(201) },
      { message: 'x' },
    ]) {
      expect(deviceMessageSchema.safeParse(bad).success).toBe(false);
    }
  });
});

describe('serverMessageSchema', () => {
  it('accepts an error with a protocol error code', () => {
    for (const code of [
      'INVALID_JSON',
      'INVALID_MESSAGE',
      'UNSUPPORTED_FRAME',
    ] as const) {
      const message = { type: 'error', code, message: 'Something is wrong' };
      expect(serverMessageSchema.parse(message)).toEqual(message);
    }
  });

  it('rejects an unknown code or unknown keys', () => {
    expect(
      serverMessageSchema.safeParse({
        type: 'error',
        code: 'NOPE',
        message: 'x',
      }).success,
    ).toBe(false);
    expect(
      serverMessageSchema.safeParse({
        type: 'error',
        code: 'INVALID_JSON',
        message: 'x',
        extra: true,
      }).success,
    ).toBe(false);
  });
});

it('names the subprotocol airremote.v1', () => {
  expect(DEVICE_SUBPROTOCOL).toBe('airremote.v1');
});
