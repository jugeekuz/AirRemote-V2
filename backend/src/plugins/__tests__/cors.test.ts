import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../app';
import { fakeDb, testEnv } from '../../__tests__/test-utils';

const origin = 'http://localhost:8081';

let app: FastifyInstance;

async function appAllowing(origins: string[]) {
  app = await buildApp({
    env: { ...testEnv, CORS_ORIGINS: origins },
    db: fakeDb(async () => []),
  });
  return app;
}

afterEach(async () => {
  await app.close();
});

describe('cors', () => {
  it('answers a preflight from an allowed origin with credentials', async () => {
    const res = await (
      await appAllowing([origin])
    ).inject({
      method: 'OPTIONS',
      url: '/auth/login',
      headers: {
        origin,
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type',
      },
    });

    expect(res.statusCode).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe(origin);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
    expect(res.headers['access-control-allow-methods']).toBe(
      'GET, HEAD, POST, PUT, PATCH, DELETE',
    );
  });

  it('adds CORS headers to a request from an allowed origin', async () => {
    const res = await (
      await appAllowing([origin])
    ).inject({ method: 'GET', url: '/health', headers: { origin } });

    expect(res.headers['access-control-allow-origin']).toBe(origin);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('echoes back whichever listed origin made the request', async () => {
    const other = 'https://app.example.com';
    const instance = await appAllowing([origin, other]);

    for (const requester of [origin, other]) {
      const res = await instance.inject({
        method: 'GET',
        url: '/health',
        headers: { origin: requester },
      });
      expect(res.headers['access-control-allow-origin']).toBe(requester);
    }
  });

  it('adds no CORS headers for another origin', async () => {
    const res = await (
      await appAllowing([origin])
    ).inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'http://evil.example' },
    });

    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('adds no CORS headers when CORS_ORIGINS is empty', async () => {
    const res = await (
      await appAllowing([])
    ).inject({ method: 'GET', url: '/health', headers: { origin } });

    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});
