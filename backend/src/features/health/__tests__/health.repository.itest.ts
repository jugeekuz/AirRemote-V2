import { describe, expect, it } from 'vitest';
import { useTestDatabase } from '../../../__tests__/test-db';
import { createHealthRepository } from '../health.repository';

const testDb = useTestDatabase();

describe('health repository', () => {
  it('pings a reachable database', async () => {
    await expect(
      createHealthRepository(testDb.db).pingDatabase(),
    ).resolves.toBeUndefined();
  });
});
