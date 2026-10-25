import { errorResponseSchema } from '@airremote/contracts';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../app';
import { AppError } from '../../shared/errors';
import { fakeDb, testEnv } from '../../__tests__/test-utils';

let app: FastifyInstance;

async function appWithTestRoutes() {
  app = await buildApp({ env: testEnv, db: fakeDb(async () => []) });
  const typed = app.withTypeProvider<ZodTypeProvider>();
  typed.post(
    '/echo',
    { schema: { body: z.object({ name: z.string() }) } },
    async (request) => request.body,
  );
  typed.get('/teapot', async () => {
    throw new AppError(409, 'Already exists');
  });
  typed.get('/maintenance', async () => {
    throw new AppError(503, 'Down for maintenance');
  });
  typed.get('/undefined', async () => {
    throw undefined;
  });
  typed.get('/boom', async () => {
    throw new Error('secret detail');
  });
  typed.get(
    '/bad',
    { schema: { response: { 200: z.object({ ok: z.boolean() }) } } },
    // Deliberately breaks its own response contract.
    async () => ({ ok: 'yes' }) as unknown as { ok: boolean },
  );
  return app;
}

afterEach(async () => {
  await app?.close();
});

describe('error handling', () => {
  it('returns 400 with details for an invalid body', async () => {
    const res = await (
      await appWithTestRoutes()
    ).inject({
      method: 'POST',
      url: '/echo',
      payload: { name: 1 },
    });
    const body = errorResponseSchema.parse(res.json());
    expect(res.statusCode).toBe(400);
    expect(body).toMatchObject({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Request validation failed',
    });
    expect(body.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: expect.stringContaining('name') }),
      ]),
    );
  });

  it('returns 400 in the error shape for malformed JSON', async () => {
    const res = await (
      await appWithTestRoutes()
    ).inject({
      method: 'POST',
      url: '/echo',
      headers: { 'content-type': 'application/json' },
      payload: '{"name":',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({
      statusCode: 400,
      error: 'Bad Request',
      message: expect.any(String),
    });
  });

  it('passes through an AppError status and message', async () => {
    const res = await (
      await appWithTestRoutes()
    ).inject({
      method: 'GET',
      url: '/teapot',
    });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({
      statusCode: 409,
      error: 'Conflict',
      message: 'Already exists',
    });
  });

  it('passes through an AppError with a 5xx status', async () => {
    const res = await (
      await appWithTestRoutes()
    ).inject({
      method: 'GET',
      url: '/maintenance',
    });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({
      statusCode: 503,
      error: 'Service Unavailable',
      message: 'Down for maintenance',
    });
  });

  it('returns a generic 500 when a non-object is thrown', async () => {
    const res = await (
      await appWithTestRoutes()
    ).inject({
      method: 'GET',
      url: '/undefined',
    });
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'An unexpected error occurred',
    });
  });

  it('hides internals of unexpected errors', async () => {
    const res = await (
      await appWithTestRoutes()
    ).inject({
      method: 'GET',
      url: '/boom',
    });
    const body = errorResponseSchema.parse(res.json());
    expect(res.statusCode).toBe(500);
    expect(body.message).toBe('An unexpected error occurred');
    expect(res.body).not.toContain('secret detail');
  });

  it('returns 500 when a response breaks its contract', async () => {
    const res = await (
      await appWithTestRoutes()
    ).inject({
      method: 'GET',
      url: '/bad',
    });
    const body = errorResponseSchema.parse(res.json());
    expect(res.statusCode).toBe(500);
    expect(body.message).toBe('An unexpected error occurred');
  });

  it('returns 404 in the error shape for unknown routes', async () => {
    const res = await (
      await appWithTestRoutes()
    ).inject({
      method: 'GET',
      url: '/nope',
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({
      statusCode: 404,
      error: 'Not Found',
      message: 'Route GET /nope not found',
    });
  });
});
