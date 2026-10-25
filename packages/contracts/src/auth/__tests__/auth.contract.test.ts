import { describe, expect, it } from 'vitest';
import {
  accessTokenResponseSchema,
  loginRequestSchema,
} from '../auth.contract';

describe('loginRequestSchema', () => {
  it('accepts an email and password', () => {
    const body = { email: 'nick@example.com', password: 'correct horse' };
    expect(loginRequestSchema.parse(body)).toEqual(body);
  });

  it('rejects a missing password or invalid email', () => {
    expect(
      loginRequestSchema.safeParse({ email: 'nick@example.com', password: '' })
        .success,
    ).toBe(false);
    expect(
      loginRequestSchema.safeParse({ email: 'nick', password: 'x' }).success,
    ).toBe(false);
  });
});

describe('accessTokenResponseSchema', () => {
  it('describes a bearer token and its lifetime in seconds', () => {
    const body = { accessToken: 'a.b.c', tokenType: 'Bearer', expiresIn: 600 };
    expect(accessTokenResponseSchema.parse(body)).toEqual(body);
    expect(
      accessTokenResponseSchema.safeParse({ ...body, tokenType: 'Basic' })
        .success,
    ).toBe(false);
  });
});
