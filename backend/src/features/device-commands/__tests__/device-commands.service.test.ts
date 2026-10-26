import { describe, expect, it, vi } from 'vitest';
import type { DeviceConnections } from '../../../shared/device-connections';
import { createDeviceCommandsService } from '../device-commands.service';
import type { DeviceCommandsRepository } from '../device-commands.repository';

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
