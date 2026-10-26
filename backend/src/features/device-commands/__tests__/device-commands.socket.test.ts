import type { FastifyBaseLogger } from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DeviceCommandsService } from '../device-commands.service';
import { createDeviceCommandsSocketHandlers } from '../device-commands.socket';

const device = { id: 'device-1', macAddress: 'aa:bb:cc:dd:ee:01' };
const commandId = '6f1c2a52-3c1e-4a8e-9a43-0d5f1f6f2b11';

let log: { info: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn> };
let service: {
  settleReadResult: ReturnType<typeof vi.fn>;
  settleSendResult: ReturnType<typeof vi.fn>;
  settleError: ReturnType<typeof vi.fn>;
};
const ctx = () => ({ device, log: log as unknown as FastifyBaseLogger });
const handlers = () =>
  createDeviceCommandsSocketHandlers({
    service: service as unknown as DeviceCommandsService,
  });

beforeEach(() => {
  log = { info: vi.fn(), warn: vi.fn() };
  service = {
    settleReadResult: vi.fn(),
    settleSendResult: vi.fn(),
    settleError: vi.fn(),
  };
});

describe('device commands socket handlers: readIrResult', () => {
  it('settles the command and logs the outcome, not the code', async () => {
    service.settleReadResult.mockResolvedValue('succeeded');

    await handlers().readIrResult(
      { type: 'readIrResult', commandId, timingsUs: [9000, 4500, 560] },
      ctx(),
    );

    expect(service.settleReadResult).toHaveBeenCalledExactlyOnceWith(
      device.id,
      commandId,
      [9000, 4500, 560],
    );
    expect(log.info).toHaveBeenCalledExactlyOnceWith(
      { commandId, entries: 3, outcome: 'succeeded' },
      'Device read an IR code',
    );
    expect(log.warn).not.toHaveBeenCalled();
  });

  it('logs name-taken at info', async () => {
    service.settleReadResult.mockResolvedValue('name-taken');

    await handlers().readIrResult(
      { type: 'readIrResult', commandId, timingsUs: [1, 2] },
      ctx(),
    );

    expect(log.info).toHaveBeenCalledExactlyOnceWith(
      { commandId, entries: 2, outcome: 'name-taken' },
      'Device read an IR code',
    );
  });

  it('warns when the command is not pending', async () => {
    service.settleReadResult.mockResolvedValue('not-pending');

    await handlers().readIrResult(
      { type: 'readIrResult', commandId, timingsUs: [1, 2] },
      ctx(),
    );

    expect(log.warn).toHaveBeenCalledExactlyOnceWith(
      { commandId, entries: 2, outcome: 'not-pending' },
      "Device read result for an unknown, late or another device's command",
    );
    expect(log.info).not.toHaveBeenCalled();
  });
});

describe('device commands socket handlers: sendIrResult', () => {
  it('settles the command and logs it at info', async () => {
    service.settleSendResult.mockResolvedValue(true);

    await handlers().sendIrResult({ type: 'sendIrResult', commandId }, ctx());

    expect(service.settleSendResult).toHaveBeenCalledExactlyOnceWith(
      device.id,
      commandId,
    );
    expect(log.info).toHaveBeenCalledExactlyOnceWith(
      { commandId, outcome: 'succeeded' },
      'Device sent an IR code',
    );
    expect(log.warn).not.toHaveBeenCalled();
  });

  it('warns when the command is not pending', async () => {
    service.settleSendResult.mockResolvedValue(false);

    await handlers().sendIrResult({ type: 'sendIrResult', commandId }, ctx());

    expect(log.warn).toHaveBeenCalledExactlyOnceWith(
      { commandId, outcome: 'not-pending' },
      "Device send result for an unknown, late or another device's command",
    );
    expect(log.info).not.toHaveBeenCalled();
  });
});

describe('device commands socket handlers: error', () => {
  it('fails the command the error answers', async () => {
    service.settleError.mockResolvedValue(true);

    await handlers().error(
      { type: 'error', code: 'READ_TIMEOUT', commandId, message: 'No code' },
      ctx(),
    );

    expect(service.settleError).toHaveBeenCalledExactlyOnceWith(
      device.id,
      commandId,
      'READ_TIMEOUT',
    );
    expect(log.warn).not.toHaveBeenCalled();
  });

  it('warns when the error answers no pending command', async () => {
    service.settleError.mockResolvedValue(false);

    await handlers().error(
      { type: 'error', code: 'READ_TIMEOUT', commandId },
      ctx(),
    );

    expect(log.warn).toHaveBeenCalledExactlyOnceWith(
      { code: 'READ_TIMEOUT', commandId },
      "Device error for an unknown, late or another device's command",
    );
  });

  it('logs an error without a command id as a warning', async () => {
    await handlers().error(
      { type: 'error', code: 'READ_TIMEOUT', message: 'Something broke' },
      ctx(),
    );

    expect(service.settleError).not.toHaveBeenCalled();
    expect(log.warn).toHaveBeenCalledExactlyOnceWith(
      { code: 'READ_TIMEOUT', deviceMessage: 'Something broke' },
      'Device reported an error',
    );
  });
});
