import type { FastifyBaseLogger } from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDevicesSocketHandlers } from '../devices.socket';

const device = { id: 'device-1', macAddress: 'aa:bb:cc:dd:ee:01' };
const commandId = '6f1c2a52-3c1e-4a8e-9a43-0d5f1f6f2b11';

let log: { info: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn> };
const ctx = () => ({ device, log: log as unknown as FastifyBaseLogger });

beforeEach(() => {
  log = { info: vi.fn(), warn: vi.fn() };
});

describe('devices socket handlers: error', () => {
  it('logs a device error with its code, request and message as a warning', async () => {
    await createDevicesSocketHandlers().error(
      {
        type: 'error',
        code: 'READ_TIMEOUT',
        commandId,
        message: 'No IR code within 15 s',
      },
      ctx(),
    );

    expect(log.warn).toHaveBeenCalledExactlyOnceWith(
      {
        code: 'READ_TIMEOUT',
        commandId,
        deviceMessage: 'No IR code within 15 s',
      },
      'Device reported an error',
    );
  });
});

describe('devices socket handlers: readIrResult', () => {
  it('logs the request and how long the code is, not the code itself', async () => {
    await createDevicesSocketHandlers().readIrResult(
      { type: 'readIrResult', commandId, timingsUs: [9000, 4500, 560] },
      ctx(),
    );

    expect(log.info).toHaveBeenCalledExactlyOnceWith(
      { commandId, entries: 3 },
      'Device read an IR code',
    );
  });
});
