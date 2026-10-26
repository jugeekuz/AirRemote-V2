import { describe, expect, it } from 'vitest';
import {
  DEVICE_SUBPROTOCOL,
  deviceErrorCodeSchema,
  deviceMessageSchema,
  irTimingsSchema,
  serverMessageSchema,
} from '../device-protocol.contract';

const requestId = '6f1c2a52-3c1e-4a8e-9a43-0d5f1f6f2b11';
const timingsUs = [9000, 4500, 560, 1690, 0, 65535];

const rejects = (
  schema: { safeParse(value: unknown): { success: boolean } },
  value: unknown,
) => expect(schema.safeParse(value).success).toBe(false);

describe('irTimingsSchema', () => {
  it('accepts 1 to 2048 whole microsecond values from 0 to 65535', () => {
    for (const timings of [[1], timingsUs, Array(2048).fill(65535)]) {
      expect(irTimingsSchema.parse(timings)).toEqual(timings);
    }
  });

  it.each([
    ['no entries', []],
    ['2049 entries', Array(2049).fill(1)],
    ['a value over 65535', [65536]],
    ['a negative value', [-1]],
    ['a fraction', [1.5]],
    ['a string', ['560']],
  ])('rejects %s', (_case, timings) => {
    rejects(irTimingsSchema, timings);
  });
});

describe('deviceMessageSchema', () => {
  it('accepts an error with just a code', () => {
    const message = { type: 'error', code: 'INTERNAL' };
    expect(deviceMessageSchema.parse(message)).toEqual(message);
  });

  it('accepts an error about a command, with a message', () => {
    const message = {
      type: 'error',
      code: 'READ_TIMEOUT',
      requestId,
      message: 'No IR code within 15 s',
    };
    expect(deviceMessageSchema.parse(message)).toEqual(message);
  });

  it('knows every device error code', () => {
    expect(deviceErrorCodeSchema.options).toEqual([
      'READ_TIMEOUT',
      'CAPTURE_TOO_LONG',
      'BUSY',
      'INVALID_COMMAND',
      'INTERNAL',
    ]);
  });

  it('accepts the code a device read', () => {
    const message = { type: 'readIrResult', requestId, timingsUs };
    expect(deviceMessageSchema.parse(message)).toEqual(message);
  });

  it.each([
    ['an error without a code', { type: 'error', message: 'boom' }],
    ['an unknown error code', { type: 'error', code: 'NOPE' }],
    ['an empty message', { type: 'error', code: 'BUSY', message: '' }],
    [
      'a message over 200 characters',
      { type: 'error', code: 'BUSY', message: 'x'.repeat(201) },
    ],
    [
      'a request id that is not a UUID',
      { type: 'error', code: 'BUSY', requestId: '1' },
    ],
    ['unknown keys', { type: 'error', code: 'BUSY', extra: 1 }],
    ['an unknown type', { type: 'hello' }],
    ['a result without a request id', { type: 'readIrResult', timingsUs }],
    [
      'a result with invalid timings',
      { type: 'readIrResult', requestId, timingsUs: [] },
    ],
  ])('rejects %s', (_case, message) => {
    rejects(deviceMessageSchema, message);
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
    rejects(serverMessageSchema, { type: 'error', code: 'NOPE', message: 'x' });
    rejects(serverMessageSchema, {
      type: 'error',
      code: 'INVALID_JSON',
      message: 'x',
      extra: true,
    });
  });

  it('accepts a command to read an IR code for 1 to 60 seconds', () => {
    for (const timeoutMs of [1_000, 15_000, 60_000]) {
      const message = { type: 'readIr', requestId, timeoutMs };
      expect(serverMessageSchema.parse(message)).toEqual(message);
    }
  });

  it.each([
    ['a timeout under 1 s', { type: 'readIr', requestId, timeoutMs: 999 }],
    ['a timeout over 60 s', { type: 'readIr', requestId, timeoutMs: 60_001 }],
    ['a fractional timeout', { type: 'readIr', requestId, timeoutMs: 1500.5 }],
    ['no request id', { type: 'readIr', timeoutMs: 15_000 }],
    ['unknown keys', { type: 'readIr', requestId, timeoutMs: 15_000, x: 1 }],
  ])('rejects a read command with %s', (_case, message) => {
    rejects(serverMessageSchema, message);
  });
});

it('names the subprotocol airremote.v1', () => {
  expect(DEVICE_SUBPROTOCOL).toBe('airremote.v1');
});
