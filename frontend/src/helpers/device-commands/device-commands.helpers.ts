import type {
  ButtonResponse,
  DeviceCommandResponse,
} from '@airremote/contracts';

import type { ApiError, ApiErrorCode } from '@app-types';
import { isSessionErrorCode } from '@helpers/errors';

import { DEVICE_COMMAND_GRACE_MS } from './device-commands.constants';

/**
 * A device command as a screen shows it: nothing sent (`idle`), waiting for
 * the device, done, or failed with the code to show.
 */
export type DeviceCommandState =
  | { status: 'idle' | 'pending' }
  | { status: 'succeeded'; button?: ButtonResponse }
  | { status: 'failed'; errorCode: ApiErrorCode };

type DeviceCommandStateInput = {
  /** The command waited for; null when none was sent. */
  commandId: string | null;
  /** The command as last read from the server. */
  command: DeviceCommandResponse | undefined;
  /** Why polling it stopped failing for good (after the query's retries). */
  pollError: ApiError | null;
  /** It stayed pending well past its lifetime. */
  isOverdue: boolean;
};

/**
 * What the device did with a command. A command that expired, or stays
 * pending past its lifetime, failed with `DEVICE_NOT_RESPONDING`; one whose
 * poll keeps failing (deleted with its device, offline) failed with the
 * poll's code. An answer the device gave wins over a later poll failure.
 */
export function getDeviceCommandState({
  commandId,
  command,
  pollError,
  isOverdue,
}: DeviceCommandStateInput): DeviceCommandState {
  if (commandId === null) {
    return { status: 'idle' };
  }
  switch (command?.status) {
    case 'succeeded':
      return command.button
        ? { status: 'succeeded', button: command.button }
        : { status: 'succeeded' };
    case 'failed':
      return {
        status: 'failed',
        errorCode: command.error?.code ?? 'DEVICE_ERROR',
      };
    case 'expired':
      return { status: 'failed', errorCode: 'DEVICE_NOT_RESPONDING' };
    default:
      break;
  }
  if (pollError) {
    return { status: 'failed', errorCode: pollError.code };
  }
  if (isOverdue) {
    return { status: 'failed', errorCode: 'DEVICE_NOT_RESPONDING' };
  }
  return { status: 'pending' };
}

/**
 * How long to wait for a pending command before giving up on it: its
 * lifetime on the server (`expiresAt - createdAt`, so the phone's clock
 * doesn't matter) plus a grace period.
 */
export function getDeviceCommandWaitMs(
  command: Pick<DeviceCommandResponse, 'createdAt' | 'expiresAt'>,
): number {
  const lifetimeMs =
    Date.parse(command.expiresAt) - Date.parse(command.createdAt);
  return Math.max(0, lifetimeMs) + DEVICE_COMMAND_GRACE_MS;
}

/**
 * Whether a failed command's code deserves the Error dialog: not when the
 * session ended (the app shows Login) or the request was cancelled.
 */
export function isReportedCommandError(code: ApiErrorCode): boolean {
  return !isSessionErrorCode(code) && code !== 'REQUEST_CANCELLED';
}
