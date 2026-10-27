import type { FastifyBaseLogger } from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DevicesService } from '../devices.service';
import { createDevicesSocketHandlers } from '../devices.socket';

const device = { id: 'device-1', macAddress: 'aa:bb:cc:dd:ee:01' };

let log: { info: ReturnType<typeof vi.fn> };
let service: { recordFirmwareVersion: ReturnType<typeof vi.fn> };
const ctx = () => ({ device, log: log as unknown as FastifyBaseLogger });
const handlers = () =>
  createDevicesSocketHandlers({
    service: service as unknown as DevicesService,
  });

beforeEach(() => {
  log = { info: vi.fn() };
  service = { recordFirmwareVersion: vi.fn() };
});

describe('devices socket handlers: hello', () => {
  it('records the firmware version and logs it', async () => {
    await handlers().hello({ type: 'hello', firmwareVersion: '0.1.0' }, ctx());

    expect(service.recordFirmwareVersion).toHaveBeenCalledExactlyOnceWith(
      device.id,
      '0.1.0',
    );
    expect(log.info).toHaveBeenCalledExactlyOnceWith(
      { firmwareVersion: '0.1.0' },
      'Device said hello',
    );
  });
});
