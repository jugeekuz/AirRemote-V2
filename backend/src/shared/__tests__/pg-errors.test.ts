import { describe, expect, it } from 'vitest';
import { isUniqueViolation } from '../pg-errors';

const violation = {
  code: '23505',
  constraint_name: 'remotes_device_id_name_key',
};

describe('isUniqueViolation', () => {
  it('reads the Postgres error Drizzle wraps in `cause`', () => {
    const error = new Error('Failed query', { cause: violation });
    expect(isUniqueViolation(error, 'remotes_device_id_name_key')).toBe(true);
  });

  it('reads an unwrapped Postgres error', () => {
    expect(isUniqueViolation(violation, 'remotes_device_id_name_key')).toBe(
      true,
    );
  });

  it.each([
    ['another constraint', new Error('x', { cause: violation }), 'other_key'],
    [
      'another error code',
      new Error('x', { cause: { ...violation, code: '23514' } }),
      'remotes_device_id_name_key',
    ],
    ['a plain error', new Error('x'), 'remotes_device_id_name_key'],
    ['null', null, 'remotes_device_id_name_key'],
    ['undefined', undefined, 'remotes_device_id_name_key'],
  ])('is false for %s', (_case, error, constraint) => {
    expect(isUniqueViolation(error, constraint)).toBe(false);
  });
});
