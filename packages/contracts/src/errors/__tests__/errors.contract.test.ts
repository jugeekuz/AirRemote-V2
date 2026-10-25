import { describe, expect, it } from 'vitest';
import { errorResponseSchema } from '../errors.contract';

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
