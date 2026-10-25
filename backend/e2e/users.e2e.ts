import { describe, expect, it } from 'vitest';
import { useTestApp } from './support/test-app';

const api = useTestApp();

function register(body: unknown) {
  return fetch(`${api.baseUrl}/users/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const nick = {
  email: 'Nick@Example.com',
  firstName: 'Nick',
  lastName: 'Papas',
  password: 'correct horse',
};

describe('POST /users/register', () => {
  it('registers a user and returns them without password data', async () => {
    const res = await register(nick);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      email: 'nick@example.com',
      firstName: 'Nick',
      lastName: 'Papas',
      createdAt: expect.any(String),
    });
  });

  it('returns 409 for an email that is already registered', async () => {
    expect((await register(nick)).status).toBe(201);
    const res = await register({ ...nick, email: 'NICK@example.com' });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      statusCode: 409,
      error: 'Conflict',
      message: 'Email is already registered',
    });
  });

  it('returns 400 naming the invalid fields', async () => {
    const res = await register({ ...nick, email: 'nick', password: 'short' });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe('Request validation failed');
    expect(body.details.map((d: { path: string }) => d.path).sort()).toEqual([
      '/email',
      '/password',
    ]);
  });

  it('starts every test with an empty database', async () => {
    // The previous tests registered this email; a clean slate accepts it again.
    expect((await register(nick)).status).toBe(201);
  });
});
