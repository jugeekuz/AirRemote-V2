import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHealthService } from '../health.service';

afterEach(() => {
  vi.useRealTimers();
});

describe('health service', () => {
  it('reports up when the ping resolves', async () => {
    const service = createHealthService({
      repository: { pingDatabase: async () => {} },
    });
    expect(await service.check()).toEqual({ status: 'ok', database: 'up' });
  });

  it('reports down when the ping rejects', async () => {
    const service = createHealthService({
      repository: {
        pingDatabase: async () => {
          throw new Error('refused');
        },
      },
    });
    expect(await service.check()).toEqual({
      status: 'unavailable',
      database: 'down',
    });
  });

  it('reports down when the ping never answers', async () => {
    vi.useFakeTimers();
    const service = createHealthService({
      repository: { pingDatabase: () => new Promise(() => {}) },
      timeoutMs: 2000,
    });
    const result = service.check();
    await vi.advanceTimersByTimeAsync(2000);
    expect(await result).toEqual({ status: 'unavailable', database: 'down' });
  });
});
