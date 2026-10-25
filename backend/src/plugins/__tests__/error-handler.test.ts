import { errorResponseSchema } from '@airremote/contracts';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { buildTestApp } from '../../__tests__/test-utils';
import { AppError } from '../../shared/errors';

let app: FastifyInstance;

async function appWithTestRoutes() {
  app = await buildTestApp();
  const typed = app.withTypeProvider<ZodTypeProvider>();
  typed.post(
    '/echo',
    { schema: { body: z.object({ name: z.string() }) } },
    async (request) => request.body,
  );
  typed.get('/taken', async () => {
    throw new AppError(409, 'EMAIL_TAKEN', 'Email is already registered');
  });
  typed.get('/unavailable', async () => {
    throw new AppError(503, 'INTERNAL_ERROR', 'Down for maintenance');
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

async function request(method: 'GET' | 'POST', url: string, payload?: unknown) {
  const res = await (
    await appWithTestRoutes()
  ).inject({
    method,
    url,
    ...(typeof payload === 'string'
      ? { payload, headers: { 'content-type': 'application/json' } }
      : payload !== undefined
        ? { payload: payload as object }
        : {}),
  });
  // Every error body must match the shared envelope contract exactly.
  expect(errorResponseSchema.strict().parse(res.json())).toEqual(res.json());
  return res;
}

const unexpected = {
  error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
};

afterEach(async () => {
  await app?.close();
});

describe('error envelope', () => {
  it('returns 400 VALIDATION_FAILED with details for an invalid body', async () => {
    const res = await request('POST', '/echo', { name: 1 });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatchObject({
      code: 'VALIDATION_FAILED',
      message: 'Request validation failed',
    });
    expect(res.json().error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: expect.stringContaining('name') }),
      ]),
    );
  });

  it('returns 400 BAD_REQUEST for malformed JSON', async () => {
    const res = await request('POST', '/echo', '{"name":');
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({
      error: { code: 'BAD_REQUEST', message: expect.any(String) },
    });
  });

  it('passes through an AppError status, code and message', async () => {
    const res = await request('GET', '/taken');
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({
      error: { code: 'EMAIL_TAKEN', message: 'Email is already registered' },
    });
  });

  it('passes through an AppError with a 5xx status', async () => {
    const res = await request('GET', '/unavailable');
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'Down for maintenance' },
    });
  });

  it('returns a generic 500 when a non-object is thrown', async () => {
    const res = await request('GET', '/undefined');
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual(unexpected);
  });

  it('hides internals of unexpected errors', async () => {
    const res = await request('GET', '/boom');
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual(unexpected);
    expect(res.body).not.toContain('secret detail');
  });

  it('returns 500 when a response breaks its contract', async () => {
    const res = await request('GET', '/bad');
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual(unexpected);
  });

  it('returns 404 NOT_FOUND for unknown routes', async () => {
    const res = await request('GET', '/nope');
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({
      error: { code: 'NOT_FOUND', message: 'Route GET /nope not found' },
    });
  });
});
