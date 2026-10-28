import type {
  ButtonResponse,
  DeviceCommandResponse,
} from '@airremote/contracts';

import type { ApiError } from '@app-types';

import { DEVICE_COMMAND_GRACE_MS } from './device-commands.constants';
import {
  getDeviceCommandState,
  getDeviceCommandWaitMs,
  isDeviceUnreachableCode,
  isReportedCommandError,
} from './device-commands.helpers';

const button: ButtonResponse = {
  id: '3c2b1a09-8f7e-4d6c-9b5a-4f3e2d1c0b9a',
  remoteId: '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d',
  name: 'Power',
};
const pending: DeviceCommandResponse = {
  id: '0f9e8d7c-6b5a-4f3e-9d2c-1b0a9f8e7d6c',
  kind: 'learn_button',
  status: 'pending',
  createdAt: '2026-10-28T10:00:00.000Z',
  expiresAt: '2026-10-28T10:00:20.000Z',
};
const notFound: ApiError = {
  status: 404,
  code: 'NOT_FOUND',
  message: 'Not found',
  isNetworkError: false,
};
const waiting = { pollError: null, isOverdue: false };

describe('getDeviceCommandState', () => {
  it('is idle without a command', () => {
    expect(
      getDeviceCommandState({
        commandId: null,
        command: undefined,
        ...waiting,
      }),
    ).toEqual({ status: 'idle' });
  });

  it('is pending until the command has loaded, and while it is pending', () => {
    expect(
      getDeviceCommandState({
        commandId: pending.id,
        command: undefined,
        ...waiting,
      }),
    ).toEqual({ status: 'pending' });
    expect(
      getDeviceCommandState({
        commandId: pending.id,
        command: pending,
        ...waiting,
      }),
    ).toEqual({ status: 'pending' });
  });

  it('carries the learned button once the command succeeded', () => {
    expect(
      getDeviceCommandState({
        commandId: pending.id,
        command: { ...pending, status: 'succeeded', button },
        ...waiting,
      }),
    ).toEqual({ status: 'succeeded', button });
  });

  it("fails with the device's code", () => {
    expect(
      getDeviceCommandState({
        commandId: pending.id,
        command: {
          ...pending,
          status: 'failed',
          error: { code: 'IR_READ_TIMEOUT', message: 'No IR' },
        },
        ...waiting,
      }),
    ).toEqual({ status: 'failed', errorCode: 'IR_READ_TIMEOUT' });
  });

  it('fails with DEVICE_ERROR when a failed command carries no code', () => {
    expect(
      getDeviceCommandState({
        commandId: pending.id,
        command: { ...pending, status: 'failed' },
        ...waiting,
      }),
    ).toEqual({ status: 'failed', errorCode: 'DEVICE_ERROR' });
  });

  it('fails with DEVICE_NOT_RESPONDING once the command expired', () => {
    expect(
      getDeviceCommandState({
        commandId: pending.id,
        command: { ...pending, status: 'expired' },
        ...waiting,
      }),
    ).toEqual({ status: 'failed', errorCode: 'DEVICE_NOT_RESPONDING' });
  });

  it("fails with the poll's code once polling failed for good", () => {
    expect(
      getDeviceCommandState({
        commandId: pending.id,
        command: pending,
        pollError: notFound,
        isOverdue: false,
      }),
    ).toEqual({ status: 'failed', errorCode: 'NOT_FOUND' });
  });

  it('fails with DEVICE_NOT_RESPONDING when the command stays pending too long', () => {
    expect(
      getDeviceCommandState({
        commandId: pending.id,
        command: pending,
        pollError: null,
        isOverdue: true,
      }),
    ).toEqual({ status: 'failed', errorCode: 'DEVICE_NOT_RESPONDING' });
  });

  it('keeps an answer the device already gave over a later poll failure', () => {
    expect(
      getDeviceCommandState({
        commandId: pending.id,
        command: { ...pending, status: 'succeeded', button },
        pollError: notFound,
        isOverdue: true,
      }),
    ).toEqual({ status: 'succeeded', button });
  });
});

describe('getDeviceCommandWaitMs', () => {
  it("is the command's lifetime plus a grace period", () => {
    expect(getDeviceCommandWaitMs(pending)).toBe(
      20_000 + DEVICE_COMMAND_GRACE_MS,
    );
  });

  it('never goes below the grace period', () => {
    expect(
      getDeviceCommandWaitMs({
        createdAt: pending.expiresAt,
        expiresAt: pending.createdAt,
      }),
    ).toBe(DEVICE_COMMAND_GRACE_MS);
  });
});

describe('isReportedCommandError', () => {
  it.each([
    'IR_READ_TIMEOUT',
    'DEVICE_NOT_RESPONDING',
    'NETWORK_ERROR',
  ] as const)('reports %s', (code) => {
    expect(isReportedCommandError(code)).toBe(true);
  });

  it.each([
    'UNAUTHORIZED',
    'INVALID_REFRESH_TOKEN',
    'REQUEST_CANCELLED',
  ] as const)(
    'keeps %s quiet (the session ended, or nobody waits any more)',
    (code) => {
      expect(isReportedCommandError(code)).toBe(false);
    },
  );
});

describe('isDeviceUnreachableCode', () => {
  it.each(['DEVICE_OFFLINE', 'DEVICE_NOT_RESPONDING'] as const)(
    'is true for %s (the online status is stale)',
    (code) => {
      expect(isDeviceUnreachableCode(code)).toBe(true);
    },
  );

  it.each(['IR_READ_TIMEOUT', 'DEVICE_BUSY', 'NETWORK_ERROR'] as const)(
    'is false for %s',
    (code) => {
      expect(isDeviceUnreachableCode(code)).toBe(false);
    },
  );
});
