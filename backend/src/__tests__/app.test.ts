import { describe, expect, it, vi } from 'vitest';
import { buildApp } from '../app';
import { fakeDb, testEnv } from './test-utils';

describe('buildApp', () => {
  it('does not close a database handle it was given', async () => {
    const db = fakeDb(async () => []);
    const close = vi.spyOn(db, 'close');
    const app = await buildApp({ env: testEnv, db });

    await app.close();

    expect(close).not.toHaveBeenCalled();
  });
});
