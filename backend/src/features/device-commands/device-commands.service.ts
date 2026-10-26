import type {
  DeviceCommandResponse,
  DeviceErrorCode,
  ErrorCode,
} from '@airremote/contracts';
import type { DeviceConnections } from '../../shared/device-connections';
import { AppError } from '../../shared/errors';
import type {
  CompleteLearnButtonResult,
  DeviceCommandsRepository,
  DeviceCommandView,
} from './device-commands.repository';

/** How long commands take; tests shorten them. */
export type DeviceCommandTimings = {
  /** How long the device reads for an IR code (1000–60000, as `readIr` allows). */
  readTimeoutMs?: number;
  /** How long a command lives after it was created. */
  ttlMs?: number;
};

export type DeviceCommandsServiceDeps = DeviceCommandTimings & {
  repository: DeviceCommandsRepository;
  connections: DeviceConnections;
};

export type DeviceCommandsService = ReturnType<
  typeof createDeviceCommandsService
>;

/** The API codes a command can end with. */
type CommandErrorCode = Extract<
  ErrorCode,
  | 'IR_READ_TIMEOUT'
  | 'IR_CODE_TOO_LONG'
  | 'IR_SEND_FAILED'
  | 'DEVICE_BUSY'
  | 'DEVICE_ERROR'
  | 'DEVICE_NOT_RESPONDING'
  | 'DEVICE_OFFLINE'
  | 'BUTTON_NAME_TAKEN'
>;

/** The `error_code`s stored: the device's own codes and the backend's. */
type StoredErrorCode =
  | DeviceErrorCode
  | 'DEVICE_DISCONNECTED'
  | 'DEVICE_OFFLINE'
  | 'BUTTON_NAME_TAKEN';

/** Stored `error_code` → API code; the mapping is done when answering. */
const API_ERROR_CODES: Record<StoredErrorCode, CommandErrorCode> = {
  READ_TIMEOUT: 'IR_READ_TIMEOUT',
  CAPTURE_TOO_LONG: 'IR_CODE_TOO_LONG',
  BUSY: 'DEVICE_BUSY',
  INVALID_COMMAND: 'DEVICE_ERROR',
  INTERNAL: 'DEVICE_ERROR',
  SEND_FAILED: 'IR_SEND_FAILED',
  DEVICE_DISCONNECTED: 'DEVICE_NOT_RESPONDING',
  DEVICE_OFFLINE: 'DEVICE_OFFLINE',
  BUTTON_NAME_TAKEN: 'BUTTON_NAME_TAKEN',
};

const ERROR_MESSAGES: Record<CommandErrorCode, string> = {
  IR_READ_TIMEOUT: 'The device did not see an IR code in time.',
  IR_CODE_TOO_LONG: 'The IR code was too long for the device to capture.',
  IR_SEND_FAILED: 'The device could not send the IR signal.',
  DEVICE_BUSY: 'The device was busy with another command.',
  DEVICE_ERROR: 'The device could not carry out the command.',
  DEVICE_NOT_RESPONDING: 'The device stopped responding.',
  DEVICE_OFFLINE: 'The device went offline.',
  BUTTON_NAME_TAKEN: 'The remote already has a button with this name.',
};

function apiErrorCode(view: DeviceCommandView): CommandErrorCode {
  if (view.status === 'expired') return 'DEVICE_NOT_RESPONDING';
  const stored = view.errorCode;
  if (stored !== null && Object.hasOwn(API_ERROR_CODES, stored)) {
    return API_ERROR_CODES[stored as StoredErrorCode];
  }
  // A code this version does not know; still a failure on the device's side.
  return 'DEVICE_ERROR';
}

function toResponse(view: DeviceCommandView): DeviceCommandResponse {
  const response: DeviceCommandResponse = {
    id: view.id,
    kind: view.kind,
    status: view.status,
    createdAt: view.createdAt.toISOString(),
    expiresAt: view.expiresAt.toISOString(),
  };
  if (view.status === 'failed' || view.status === 'expired') {
    const code = apiErrorCode(view);
    response.error = { code, message: ERROR_MESSAGES[code] };
  }
  if (view.status === 'succeeded' && view.button) response.button = view.button;
  return response;
}

const deviceOffline = () =>
  new AppError(409, 'DEVICE_OFFLINE', 'The device is offline');

export function createDeviceCommandsService({
  repository,
  connections,
  readTimeoutMs = 15_000,
  ttlMs = 20_000,
}: DeviceCommandsServiceDeps) {
  return {
    /**
     * Asks the device to read an IR code for a new button on `remoteId`.
     * Returns the pending command; the device's reply settles it.
     */
    async startLearnButton({
      deviceId,
      remoteId,
      name,
    }: {
      deviceId: string;
      remoteId: string;
      name: string;
    }): Promise<DeviceCommandResponse> {
      if (!connections.isConnected(deviceId)) throw deviceOffline();

      const command = await repository.create({
        deviceId,
        kind: 'learn_button',
        context: { remoteId, name },
        ttlMs,
      });
      if (!command) {
        throw new AppError(
          409,
          'DEVICE_BUSY',
          'The device is busy with another command',
        );
      }

      const connectionId = connections.send(deviceId, {
        type: 'readIr',
        commandId: command.id,
        timeoutMs: readTimeoutMs,
      });
      if (!connectionId) {
        // The device left between the check and the send.
        await repository.fail({
          id: command.id,
          deviceId,
          errorCode: 'DEVICE_OFFLINE',
        });
        throw deviceOffline();
      }
      await repository.recordConnection(command.id, connectionId);

      return toResponse({ ...command, button: null });
    },

    /** A command on one of the user's devices, as the poll answers it. */
    async get(userId: string, id: string): Promise<DeviceCommandResponse> {
      const view = await repository.findForUser(id, userId);
      if (!view) {
        throw new AppError(404, 'NOT_FOUND', 'Device command not found');
      }
      return toResponse(view);
    },

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
