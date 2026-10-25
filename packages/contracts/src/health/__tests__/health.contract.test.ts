import { describe, expect, it } from 'vitest';
import { healthResponseSchema } from '../health.contract';

describe('healthResponseSchema', () => {
  it('accepts a healthy response', () => {
    expect(
      healthResponseSchema.parse({ status: 'ok', database: 'up' }),
    ).toEqual({
      status: 'ok',
      database: 'up',
    });
  });

  it('rejects an unknown status', () => {
    expect(
      healthResponseSchema.safeParse({ status: 'fine', database: 'up' })
        .success,
    ).toBe(false);
  });
});
