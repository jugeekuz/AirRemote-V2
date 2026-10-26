import type { ServerMessage } from '@airremote/contracts';
import { describe, expect, it } from 'vitest';
import {
  decodeDeviceFrame,
  encodeServerMessage,
  InvalidServerMessageError,
} from '../device-messages';

const text = (value: unknown) => Buffer.from(JSON.stringify(value));

describe('decodeDeviceFrame', () => {
  it('decodes a valid text frame', () => {
    const message = { type: 'error', message: 'IR receiver timed out' };
    expect(decodeDeviceFrame(text(message), false)).toEqual({
      ok: true,
      message,
    });
  });

  it('rejects a binary frame with UNSUPPORTED_FRAME', () => {
    expect(
      decodeDeviceFrame(text({ type: 'error', message: 'x' }), true),
    ).toEqual({
      ok: false,
      code: 'UNSUPPORTED_FRAME',
      detail: 'Binary frames are not supported',
    });
  });

  it('rejects text that is not JSON with INVALID_JSON', () => {
    expect(decodeDeviceFrame(Buffer.from('{nope'), false)).toEqual({
      ok: false,
      code: 'INVALID_JSON',
      detail: 'Message is not valid JSON',
    });
  });

  it('rejects JSON that fails the schema with INVALID_MESSAGE and names the first problem', () => {
    const result = decodeDeviceFrame(
      text({ type: 'error', message: 1 }),
      false,
    );
    expect(result).toMatchObject({ ok: false, code: 'INVALID_MESSAGE' });
    expect(result.ok === false && result.detail).toMatch(/^message: /);
  });

  it('keeps INVALID_MESSAGE details within 200 characters', () => {
    const result = decodeDeviceFrame(
      text({ type: 'error', message: 'x', ['k'.repeat(300)]: 1 }),
      false,
    );
    expect(result).toMatchObject({ ok: false, code: 'INVALID_MESSAGE' });
    expect(result.ok === false && result.detail.length).toBeLessThanOrEqual(
      200,
    );
  });
});

describe('encodeServerMessage', () => {
  it('encodes a valid server message as JSON', () => {
    const message: ServerMessage = {
      type: 'error',
      code: 'INVALID_JSON',
      message: 'Message is not valid JSON',
    };
    expect(JSON.parse(encodeServerMessage(message))).toEqual(message);
  });

  it('throws InvalidServerMessageError for a message that fails the schema', () => {
    const message = {
      type: 'error',
      code: 'NOPE',
      message: 'x',
    } as unknown as ServerMessage;
    expect(() => encodeServerMessage(message)).toThrow(
      InvalidServerMessageError,
    );
  });
});
