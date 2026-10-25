import type { HealthResponse } from '@airremote/contracts';
import type { HealthRepository } from './health.repository';

export type HealthService = {
  check(): Promise<HealthResponse>;
};

const UNAVAILABLE: HealthResponse = { status: 'unavailable', database: 'down' };

export function createHealthService({
  repository,
  timeoutMs = 2000,
}: {
  repository: HealthRepository;
  timeoutMs?: number;
}): HealthService {
  return {
    async check() {
      let timer: NodeJS.Timeout | undefined;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('Database ping timed out')),
          timeoutMs,
        );
      });
      try {
        await Promise.race([repository.pingDatabase(), timeout]);
        return { status: 'ok', database: 'up' };
      } catch {
        return UNAVAILABLE;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
