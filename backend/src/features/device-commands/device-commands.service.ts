import type { DeviceErrorCode } from '@airremote/contracts';
import type { DeviceConnections } from '../../shared/device-connections';
import type {
  CompleteLearnButtonResult,
  DeviceCommandsRepository,
} from './device-commands.repository';

export type DeviceCommandsServiceDeps = {
  repository: DeviceCommandsRepository;
  connections: DeviceConnections;
  /** How long the device reads for an IR code. */
  readTimeoutMs?: number;
  /** How long a command lives after it was created. */
  ttlMs?: number;
};

export type DeviceCommandsService = ReturnType<
  typeof createDeviceCommandsService
>;

export function createDeviceCommandsService({
  repository,
}: DeviceCommandsServiceDeps) {
  return {
    /** Saves the learned button and settles the command. */
    settleReadResult(
      deviceId: string,
      commandId: string,
      timingsUs: number[],
    ): Promise<CompleteLearnButtonResult> {
      return repository.completeLearnButton({
        id: commandId,
        deviceId,
        timingsUs,
      });
    },

    /** Fails the command with the device's error code. False when none is pending. */
    settleError(
      deviceId: string,
      commandId: string,
      code: DeviceErrorCode,
    ): Promise<boolean> {
      return repository.fail({ id: commandId, deviceId, errorCode: code });
    },

    /** Fails the commands sent over a connection that closed. */
    connectionClosed(deviceId: string, connectionId: string): Promise<number> {
      return repository.failConnection({
        deviceId,
        connectionId,
        errorCode: 'DEVICE_DISCONNECTED',
      });
    },
  };
}
