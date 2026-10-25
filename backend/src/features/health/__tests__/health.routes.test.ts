import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../../app';
import { fakeDb, testEnv } from '../../../__tests__/test-utils';

let app: FastifyInstance;

afterEach(async () => {
  await app?.close();
});

describe('GET /health', () => {
  it('returns 200 when the database answers', async () => {
    app = await buildApp({
      env: testEnv,
      db: fakeDb(async () => [{ '?column?': 1 }]),
    });
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok', database: 'up' });
  });

  it('returns 503 when the database errors', async () => {
    app = await buildApp({
      env: testEnv,
      db: fakeDb(async () => {
        throw new Error('down');
      }),
    });
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ status: 'unavailable', database: 'down' });
  });
});
