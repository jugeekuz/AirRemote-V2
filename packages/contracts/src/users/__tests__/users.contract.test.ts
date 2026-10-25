import { describe, expect, it } from 'vitest';
import { registerUserRequestSchema } from '../users.contract';

const valid = {
  email: 'nick@example.com',
  firstName: 'Nick',
  lastName: 'Papas',
  password: 'correct horse',
};

describe('registerUserRequestSchema', () => {
  it('accepts a valid registration and trims names', () => {
    expect(
      registerUserRequestSchema.parse({
        ...valid,
        firstName: '  Nick ',
        lastName: ' Papas ',
      }),
    ).toEqual(valid);
  });

  it('rejects an invalid email', () => {
    expect(
      registerUserRequestSchema.safeParse({ ...valid, email: 'nick' }).success,
    ).toBe(false);
  });

  it('rejects a password shorter than 8 or longer than 128 characters', () => {
    expect(
      registerUserRequestSchema.safeParse({ ...valid, password: '1234567' })
        .success,
    ).toBe(false);
    expect(
      registerUserRequestSchema.safeParse({
        ...valid,
        password: 'x'.repeat(129),
      }).success,
    ).toBe(false);
  });

  it('rejects blank or overlong names', () => {
    expect(
      registerUserRequestSchema.safeParse({ ...valid, firstName: '   ' })
        .success,
    ).toBe(false);
    expect(
      registerUserRequestSchema.safeParse({
        ...valid,
        lastName: 'x'.repeat(101),
      }).success,
    ).toBe(false);
  });
});
