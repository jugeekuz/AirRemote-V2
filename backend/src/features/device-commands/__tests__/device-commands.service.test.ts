import { deviceCommandResponseSchema } from '@airremote/contracts';
import type { DeviceCommand } from '@airremote/db';
import { describe, expect, it, vi } from 'vitest';
import type { DeviceConnections } from '../../../shared/device-connections';
import { AppError } from '../../../shared/errors';
import { createDeviceCommandsService } from '../device-commands.service';
import type {
  DeviceCommandsRepository,
  DeviceCommandView,
} from '../device-commands.repository';

function setup() {
  const repository = {
    completeLearnButton: vi.fn(),
    fail: vi.fn(),
    failConnection: vi.fn(),
  };
  const service = createDeviceCommandsService({
    repository: repository as unknown as DeviceCommandsRepository,
    connections: {} as DeviceConnections,
  });
  return { repository, service };
}

describe('device commands service: settling', () => {
  it('completes the learn command with the timings and returns the outcome', async () => {
    const { repository, service } = setup();
    repository.completeLearnButton.mockResolvedValue('name-taken');

    await expect(
      service.settleReadResult('device-1', 'cmd-1', [9000, 4500]),
    ).resolves.toBe('name-taken');
    expect(repository.completeLearnButton).toHaveBeenCalledExactlyOnceWith({
      id: 'cmd-1',
      deviceId: 'device-1',
      timingsUs: [9000, 4500],
    });
  });

  it('fails the command with the device error code', async () => {
    const { repository, service } = setup();
    repository.fail.mockResolvedValue(true);

    await expect(
      service.settleError('device-1', 'cmd-1', 'READ_TIMEOUT'),
    ).resolves.toBe(true);
    expect(repository.fail).toHaveBeenCalledExactlyOnceWith({
      id: 'cmd-1',
      deviceId: 'device-1',
      errorCode: 'READ_TIMEOUT',
    });
  });

  it('fails the connection’s pending commands with DEVICE_DISCONNECTED', async () => {
    const { repository, service } = setup();
    repository.failConnection.mockResolvedValue(2);

    await expect(service.connectionClosed('device-1', 'conn-1')).resolves.toBe(
      2,
    );
    expect(repository.failConnection).toHaveBeenCalledExactlyOnceWith({
      deviceId: 'device-1',
      connectionId: 'conn-1',
      errorCode: 'DEVICE_DISCONNECTED',
    });
  });
});

const deviceId = '0b6f1c2a-3c1e-4a8e-9a43-0d5f1f6f2b11';
const remoteId = '1c2a523c-1e4a-4e9a-830d-5f1f6f2b1101';
const commandId = '2a523c1e-4a8e-4a43-8d5f-1f6f2b110101';
const createdAt = new Date('2026-10-26T12:00:00.000Z');
const expiresAt = new Date('2026-10-26T12:00:20.000Z');

const created: DeviceCommand = {
  id: commandId,
  deviceId,
  kind: 'learn_button',
  context: { remoteId, name: 'Power' },
  status: 'pending',
  errorCode: null,
  resultId: null,
  connectionId: null,
  createdAt,
  expiresAt,
  finishedAt: null,
};

function learnSetup({
  connected = true,
  sentOver = 'conn-1' as string | null,
  command = created as DeviceCommand | null,
  options = {} as { readTimeoutMs?: number; ttlMs?: number },
} = {}) {
  const repository = {
    create: vi.fn(async () => command),
    recordConnection: vi.fn(async () => {}),
    fail: vi.fn(async () => true),
  };
  const connections = {
    isConnected: vi.fn(() => connected),
    send: vi.fn(() => sentOver),
  };
  const service = createDeviceCommandsService({
    repository: repository as unknown as DeviceCommandsRepository,
    connections: connections as unknown as DeviceConnections,
    ...options,
  });
  return { repository, connections, service };
}

async function appErrorOf(promise: Promise<unknown>) {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(AppError);
  const { statusCode, code } = error as AppError;
  return { statusCode, code };
}

const learn = { deviceId, remoteId, name: 'Power' };

describe('device commands service: startLearnButton', () => {
  it('creates the command, sends readIr, records the connection and returns it pending', async () => {
    const { repository, connections, service } = learnSetup();

    await expect(service.startLearnButton(learn)).resolves.toEqual({
      id: commandId,
      kind: 'learn_button',
      status: 'pending',
      createdAt: '2026-10-26T12:00:00.000Z',
      expiresAt: '2026-10-26T12:00:20.000Z',
    });
    expect(repository.create).toHaveBeenCalledExactlyOnceWith({
      deviceId,
      kind: 'learn_button',
      context: { remoteId, name: 'Power' },
      ttlMs: 20_000,
    });
    expect(connections.send).toHaveBeenCalledExactlyOnceWith(deviceId, {
      type: 'readIr',
      commandId,
      timeoutMs: 15_000,
    });
    expect(repository.recordConnection).toHaveBeenCalledExactlyOnceWith(
      commandId,
      'conn-1',
    );
    expect(repository.fail).not.toHaveBeenCalled();
  });

  it('uses the configured read timeout and time to live', async () => {
    const { repository, connections, service } = learnSetup({
      options: { readTimeoutMs: 2_000, ttlMs: 3_000 },
    });

    await service.startLearnButton(learn);

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ ttlMs: 3_000 }),
    );
    expect(connections.send).toHaveBeenCalledWith(
      deviceId,
      expect.objectContaining({ timeoutMs: 2_000 }),
    );
  });

  it('answers 409 DEVICE_OFFLINE when the device is not connected, creating nothing', async () => {
    const { repository, connections, service } = learnSetup({
      connected: false,
    });

    await expect(appErrorOf(service.startLearnButton(learn))).resolves.toEqual({
      statusCode: 409,
      code: 'DEVICE_OFFLINE',
    });
    expect(connections.isConnected).toHaveBeenCalledExactlyOnceWith(deviceId);
    expect(repository.create).not.toHaveBeenCalled();
    expect(connections.send).not.toHaveBeenCalled();
  });

  it('answers 409 DEVICE_BUSY when the device already has a pending command, sending nothing', async () => {
    const { connections, service } = learnSetup({ command: null });

    await expect(appErrorOf(service.startLearnButton(learn))).resolves.toEqual({
      statusCode: 409,
      code: 'DEVICE_BUSY',
    });
    expect(connections.send).not.toHaveBeenCalled();
  });

  it('fails the command DEVICE_OFFLINE and answers 409 when the device left before the send', async () => {
    const { repository, service } = learnSetup({ sentOver: null });

    await expect(appErrorOf(service.startLearnButton(learn))).resolves.toEqual({
      statusCode: 409,
      code: 'DEVICE_OFFLINE',
    });
    expect(repository.fail).toHaveBeenCalledExactlyOnceWith({
      id: commandId,
      deviceId,
      errorCode: 'DEVICE_OFFLINE',
    });
    expect(repository.recordConnection).not.toHaveBeenCalled();
  });
});

const userId = '6f1c2a52-3c1e-4a8e-9a43-0d5f1f6f2b11';

const view: DeviceCommandView = {
  id: commandId,
  kind: 'learn_button',
  status: 'pending',
  errorCode: null,
  createdAt,
  expiresAt,
  button: null,
};

function getSetup(found: DeviceCommandView | null) {
  const repository = { findForUser: vi.fn(async () => found) };
  const service = createDeviceCommandsService({
    repository: repository as unknown as DeviceCommandsRepository,
    connections: {} as DeviceConnections,
  });
  return { repository, service };
}

const times = {
  id: commandId,
  kind: 'learn_button',
  createdAt: '2026-10-26T12:00:00.000Z',
  expiresAt: '2026-10-26T12:00:20.000Z',
} as const;

describe('device commands service: get', () => {
  it('returns a pending command without error or button', async () => {
    const { repository, service } = getSetup(view);

    const command = await service.get(userId, commandId);

    expect(command).toEqual({ ...times, status: 'pending' });
    expect(deviceCommandResponseSchema.parse(command)).toEqual(command);
    expect(repository.findForUser).toHaveBeenCalledExactlyOnceWith(
      commandId,
      userId,
    );
  });

  it('returns a succeeded command with its button', async () => {
    const button = {
      id: '3c1e4a8e-9a43-4d5f-8f6f-2b1101010101',
      remoteId,
      name: 'Power',
    };
    const { service } = getSetup({ ...view, status: 'succeeded', button });

    const command = await service.get(userId, commandId);

    expect(command).toEqual({ ...times, status: 'succeeded', button });
    expect(deviceCommandResponseSchema.parse(command)).toEqual(command);
  });

  it.each([
    ['failed', 'READ_TIMEOUT', 'IR_READ_TIMEOUT'],
    ['failed', 'CAPTURE_TOO_LONG', 'IR_CODE_TOO_LONG'],
    ['failed', 'BUSY', 'DEVICE_BUSY'],
    ['failed', 'INVALID_COMMAND', 'DEVICE_ERROR'],
    ['failed', 'INTERNAL', 'DEVICE_ERROR'],
    ['failed', 'DEVICE_DISCONNECTED', 'DEVICE_NOT_RESPONDING'],
    ['failed', 'DEVICE_OFFLINE', 'DEVICE_OFFLINE'],
    ['failed', 'BUTTON_NAME_TAKEN', 'BUTTON_NAME_TAKEN'],
    ['failed', 'SOMETHING_NEW', 'DEVICE_ERROR'],
    ['expired', null, 'DEVICE_NOT_RESPONDING'],
  ] as const)(
    'answers a %s command stored with %s as %s',
    async (status, errorCode, code) => {
      const { service } = getSetup({ ...view, status, errorCode });

      const command = await service.get(userId, commandId);

      expect(command).toEqual({
        ...times,
        status,
        error: { code, message: expect.any(String) },
      });
      expect(command.error?.message).toMatch(/^[A-Z].+\.$/);
      expect(deviceCommandResponseSchema.parse(command)).toEqual(command);
    },
  );

  it('gives each API error code its own message', async () => {
    const messages = new Map<string, string>();
    for (const [status, errorCode] of [
      ['failed', 'READ_TIMEOUT'],
      ['failed', 'CAPTURE_TOO_LONG'],
      ['failed', 'BUSY'],
      ['failed', 'INTERNAL'],
      ['failed', 'DEVICE_DISCONNECTED'],
      ['failed', 'DEVICE_OFFLINE'],
      ['failed', 'BUTTON_NAME_TAKEN'],
    ] as const) {
      const { service } = getSetup({ ...view, status, errorCode });
      const { error } = await service.get(userId, commandId);
      messages.set(error!.code, error!.message);
    }
    expect(new Set(messages.values()).size).toBe(messages.size);
  });

  it('answers 404 NOT_FOUND for a command that is not on the user’s devices', async () => {
    const { service } = getSetup(null);

    await expect(appErrorOf(service.get(userId, commandId))).resolves.toEqual({
      statusCode: 404,
      code: 'NOT_FOUND',
    });
  });
});
