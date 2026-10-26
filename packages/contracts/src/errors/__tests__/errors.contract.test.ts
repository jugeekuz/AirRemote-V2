import { describe, expect, it } from 'vitest';
import { errorCodeSchema, errorResponseSchema } from '../errors.contract';

describe('errorResponseSchema', () => {
  it('accepts an error envelope with a known code', () => {
    const body = {
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Request validation failed',
        details: [{ path: '/email', message: 'Invalid email' }],
      },
    };
    expect(errorResponseSchema.parse(body)).toEqual(body);
  });

  it('rejects an unknown code', () => {
    expect(
      errorResponseSchema.safeParse({
        error: { code: 'SOMETHING_ELSE', message: 'x' },
      }).success,
    ).toBe(false);
  });

  it('rejects an error that is not wrapped in the envelope', () => {
    expect(
      errorResponseSchema.safeParse({ code: 'NOT_FOUND', message: 'x' })
        .success,
    ).toBe(false);
  });
});

describe('errorCodeSchema', () => {
  it.each([
    'REMOTE_NAME_TAKEN',
    'BUTTON_NAME_TAKEN',
    'DEVICE_OFFLINE',
    'DEVICE_BUSY',
    'IR_READ_TIMEOUT',
    'IR_CODE_TOO_LONG',
    'DEVICE_ERROR',
    'DEVICE_NOT_RESPONDING',
  ])('includes %s', (code) => {
    expect(errorCodeSchema.options).toContain(code);
  });
});

describe('errorCodeSchema', () => {
  it('knows IR_SEND_FAILED', () => {
    expect(errorCodeSchema.options).toContain('IR_SEND_FAILED');
  });
});
