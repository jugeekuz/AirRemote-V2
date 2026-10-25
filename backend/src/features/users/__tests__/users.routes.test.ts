import type { RegisterUserRequest, UserResponse } from '@airremote/contracts';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildTestApp } from '../../../__tests__/test-utils';
import { AppError } from '../../../shared/errors';
import { usersRoutes } from '../users.routes';
import type { UsersService } from '../users.service';

const body = {
  email: 'nick@example.com',
  firstName: 'Nick',
  lastName: 'Papas',
  password: 'correct horse',
};

const registered: UserResponse = {
  id: '6f1c2a52-3c1e-4a8e-9a43-0d5f1f6f2b11',
  email: 'nick@example.com',
  firstName: 'Nick',
  lastName: 'Papas',
  createdAt: '2026-10-25T12:00:00.000Z',
};

let app: FastifyInstance;
let received: RegisterUserRequest[];

async function appWith(register: UsersService['register']) {
  received = [];
  app = await buildTestApp();
  await app.register(usersRoutes, {
    prefix: '/users',
    service: {
      register: async (input) => {
        received.push(input);
        return register(input);
      },
    },
  });
  return app;
}

afterEach(async () => {
  await app?.close();
});

describe('POST /users/register', () => {
  it('returns 201 with the registered user', async () => {
    await appWith(async () => registered);
    const res = await app.inject({
      method: 'POST',
      url: '/users/register',
      payload: body,
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual(registered);
    expect(received).toEqual([body]);
  });

  it('never sends password data, even if the service returns it', async () => {
    await appWith(
      async () =>
        ({
          ...registered,
          passwordHash: 'abc',
          passwordSalt: 'def',
        }) as UserResponse,
    );
    const res = await app.inject({
      method: 'POST',
      url: '/users/register',
      payload: body,
    });
    expect(res.json()).toEqual(registered);
  });

  it('returns 400 with details for a short password, without calling the service', async () => {
    await appWith(async () => registered);
    const res = await app.inject({
      method: 'POST',
      url: '/users/register',
      payload: { ...body, password: 'short' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: expect.stringContaining('password') }),
      ]),
    );
    expect(received).toEqual([]);
  });

  it('returns 409 when the email is already registered', async () => {
    await appWith(async () => {
      throw new AppError(409, 'Email is already registered');
    });
    const res = await app.inject({
      method: 'POST',
      url: '/users/register',
      payload: body,
    });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({
      statusCode: 409,
      error: 'Conflict',
      message: 'Email is already registered',
    });
  });
});
