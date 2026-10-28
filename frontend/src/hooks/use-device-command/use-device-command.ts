import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { deviceCommandQueries } from '@queries/device-commands';
import {
  getDeviceCommandState,
  getDeviceCommandWaitMs,
  isReportedCommandError,
  type DeviceCommandState,
} from '@helpers/device-commands';
import { alert } from '@ui';

export type { DeviceCommandState } from '@helpers/device-commands';

/** The disabled query's id while no command is waited for. */
const NO_COMMAND = '';

/**
 * Follows a command sent to a device (learning or pressing a button) until
 * the device settles it, polling while it is pending. The mutation that
 * sent it seeds the query, so the first state is already `pending`.
 *
 * A command fails when the device says so, when it expires
 * (`DEVICE_NOT_RESPONDING`), when it is still pending when asked once more
 * well past its lifetime (the same code), or when its poll keeps failing after the query's retries
 * (that error's code: `NOT_FOUND` once the device was deleted, a network
 * error, ...). Polling stops in every case. A failure opens the Error
 * dialog once per command, except when the session ended (the app shows
 * Login).
 */
export function useDeviceCommand(commandId: string | null): DeviceCommandState {
  const { t } = useTranslation('messages');
  const [overdueId, setOverdueId] = useState<string | null>(null);
  const isOverdue = commandId !== null && overdueId === commandId;
  const {
    data: command,
    error,
    refetch,
  } = useQuery({
    ...deviceCommandQueries.detail(commandId ?? NO_COMMAND),
    enabled: commandId !== null && !isOverdue,
  });
  const state = getDeviceCommandState({
    commandId,
    command,
    pollError: error,
    isOverdue,
  });

  // The server expires a command it never heard back on; this ends the wait
  // even if that report never comes. Polling pauses while the app is in the
  // background and this timer doesn't, so it asks once more first: the
  // command may have settled meanwhile (a learned button is then kept).
  const isPending = command?.status === 'pending';
  const createdAt = command?.createdAt;
  const expiresAt = command?.expiresAt;
  useEffect(() => {
    if (
      commandId === null ||
      !isPending ||
      createdAt === undefined ||
      expiresAt === undefined
    ) {
      return;
    }
    const timer = setTimeout(() => {
      void refetch().then((last) => {
        if (last.isError || last.data?.status === 'pending') {
          setOverdueId(commandId);
        }
      });
    }, getDeviceCommandWaitMs({ createdAt, expiresAt }));
    return () => {
      clearTimeout(timer);
    };
  }, [commandId, isPending, createdAt, expiresAt, refetch]);

  const reportedIdRef = useRef<string | null>(null);
  const errorCode = state.status === 'failed' ? state.errorCode : undefined;
  useEffect(() => {
    if (
      commandId === null ||
      errorCode === undefined ||
      reportedIdRef.current === commandId
    ) {
      return;
    }
    reportedIdRef.current = commandId;
    if (isReportedCommandError(errorCode)) {
      alert.error(t(`errors.${errorCode}`));
    }
  }, [commandId, errorCode, t]);

  return state;
}
