import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { testEnv } from '../src/__tests__/test-utils';
import { useTestApp } from './support/test-app';

const api = useTestApp();

describe('GET /health', () => {
  it('returns 200 when the database is reachable', async () => {
    const res = await fetch(`${api.baseUrl}/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok', database: 'up' });
  });

  it('starts and returns 503 when the database is unreachable', async () => {
    const app = await buildApp({
      env: { ...testEnv, DATABASE_URL: 'postgres://u:p@127.0.0.1:1/none' },
    });
    try {
      const baseUrl = await app.listen({ host: '127.0.0.1', port: 0 });
      const res = await fetch(`${baseUrl}/health`);
      expect(res.status).toBe(503);
      expect(await res.json()).toEqual({
        status: 'unavailable',
        database: 'down',
      });
    } finally {
      await app.close();
    }
  });
});
