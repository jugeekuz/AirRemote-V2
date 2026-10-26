import type { FastifyBaseLogger } from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { createDevicesSocketHandlers } from '../devices.socket';

describe('devices socket handlers: error', () => {
  it('logs a device error report as a warning', async () => {
    const log = { warn: vi.fn() };
    const device = { id: 'device-1', macAddress: 'aa:bb:cc:dd:ee:01' };

    await createDevicesSocketHandlers().error(
      { type: 'error', message: 'boom' },
      { device, log: log as unknown as FastifyBaseLogger },
    );

    expect(log.warn).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ deviceMessage: 'boom' }),
      'Device reported an error',
    );
  });
});
