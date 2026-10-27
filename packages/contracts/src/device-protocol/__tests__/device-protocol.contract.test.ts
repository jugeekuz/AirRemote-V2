import { describe, expect, it } from 'vitest';
import {
  DEVICE_SUBPROTOCOL,
  deviceErrorCodeSchema,
  deviceMessageSchema,
  irTimingsSchema,
  serverMessageSchema,
} from '../device-protocol.contract';

const commandId = '6f1c2a52-3c1e-4a8e-9a43-0d5f1f6f2b11';
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
      commandId,
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
      'SEND_FAILED',
      'INTERNAL',
    ]);
  });

  it('accepts the code a device read', () => {
    const message = { type: 'readIrResult', commandId, timingsUs };
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
      'a command id that is not a UUID',
      { type: 'error', code: 'BUSY', commandId: '1' },
    ],
    ['unknown keys', { type: 'error', code: 'BUSY', extra: 1 }],
    ['an unknown type', { type: 'hello' }],
    ['a result without a command id', { type: 'readIrResult', timingsUs }],
    [
      'a result with invalid timings',
      { type: 'readIrResult', commandId, timingsUs: [] },
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
      const message = { type: 'readIr', commandId, timeoutMs };
      expect(serverMessageSchema.parse(message)).toEqual(message);
    }
  });

  it.each([
    ['a timeout under 1 s', { type: 'readIr', commandId, timeoutMs: 999 }],
    ['a timeout over 60 s', { type: 'readIr', commandId, timeoutMs: 60_001 }],
    ['a fractional timeout', { type: 'readIr', commandId, timeoutMs: 1500.5 }],
    ['no command id', { type: 'readIr', timeoutMs: 15_000 }],
    ['unknown keys', { type: 'readIr', commandId, timeoutMs: 15_000, x: 1 }],
  ])('rejects a read command with %s', (_case, message) => {
    rejects(serverMessageSchema, message);
  });
});

it('names the subprotocol airremote.v1', () => {
  expect(DEVICE_SUBPROTOCOL).toBe('airremote.v1');
});

describe('sendIr messages', () => {
  it('accepts sendIr from the server', () => {
    const message = { type: 'sendIr', commandId, timingsUs };
    expect(serverMessageSchema.parse(message)).toEqual(message);
  });

  it('accepts sendIrResult from a device', () => {
    const message = { type: 'sendIrResult', commandId };
    expect(deviceMessageSchema.parse(message)).toEqual(message);
  });

  it.each([
    [
      'sendIr with unknown keys',
      serverMessageSchema,
      { type: 'sendIr', commandId, timingsUs, extra: 1 },
    ],
    [
      'sendIr without a commandId',
      serverMessageSchema,
      { type: 'sendIr', timingsUs },
    ],
    [
      'sendIr without timings',
      serverMessageSchema,
      { type: 'sendIr', commandId },
    ],
    [
      'sendIrResult with unknown keys',
      deviceMessageSchema,
      { type: 'sendIrResult', commandId, extra: 1 },
    ],
    [
      'sendIrResult without a commandId',
      deviceMessageSchema,
      { type: 'sendIrResult' },
    ],
  ])('rejects %s', (_case, schema, message) => {
    rejects(schema, message);
  });

  it('keeps the largest sendIr under 16 KiB', () => {
    const largest = {
      type: 'sendIr',
      commandId,
      timingsUs: Array(2048).fill(65535),
    };
    expect(serverMessageSchema.parse(largest)).toEqual(largest);
    expect(JSON.stringify(largest).length).toBeLessThan(16 * 1024);
  });
});

describe('hello messages', () => {
  const hello = (firmwareVersion: unknown) => ({
    type: 'hello',
    firmwareVersion,
  });

  it('accepts a version like 1.2.3, with an optional suffix', () => {
    for (const version of ['0.1.0', '10.20.30', '1.0.0-beta.1']) {
      expect(deviceMessageSchema.parse(hello(version))).toEqual(hello(version));
    }
  });

  it('rejects other version shapes and versions over 31 characters', () => {
    const tooLong = `1.0.0-${'a'.repeat(26)}`;
    expect(tooLong).toHaveLength(32);
    for (const version of ['1.0', 'v1.0.0', '1.0.0+build', tooLong, 1]) {
      rejects(deviceMessageSchema, hello(version));
    }
    expect(
      deviceMessageSchema.safeParse(hello(`1.0.0-${'a'.repeat(25)}`)).success,
    ).toBe(true);
  });

  it('rejects a missing version and unknown keys', () => {
    rejects(deviceMessageSchema, { type: 'hello' });
    rejects(deviceMessageSchema, { ...hello('0.1.0'), commandId });
  });
});
