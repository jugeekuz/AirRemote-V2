import { useCallback, useEffect, useEffectEvent, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import type { ApiErrorCode } from '@app-types';
import { buttonKeys, useLearnButtonMutation } from '@queries/buttons';
import { deviceKeys } from '@queries/devices';
import { isDeviceUnreachableCode } from '@helpers/device-commands';
import { useDeviceCommand } from '@hooks/use-device-command';

type LearnButtonCallbacks = {
  /**
   * The learn is over: the button was read (the remote's buttons are being
   * asked for again), or it failed (its Error dialog is open).
   */
  onDone: () => void;
  /** The server refused the name up front: the remote already has it. */
  onNameTaken: () => void;
};

type LearnButton = {
  /** The learn was sent and the device hasn't settled it yet. */
  isListening: boolean;
  /** Asks the remote's device to read a button with this (trimmed) name. */
  learn: (name: string) => void;
};

/**
 * Learning a button on a remote: the device listens for a physical remote,
 * and the command is followed until the device settles it. However it
 * ends, the remote's buttons are asked for again; when the device was
 * unreachable, the devices too (their online status). A failure's
 * Error dialog comes from `useDeviceCommand` (one refused up front from the
 * global mutation error handler), so nothing here shows one.
 */
export function useLearnButton(
  remoteId: string,
  { onDone, onNameTaken }: LearnButtonCallbacks,
): LearnButton {
  const queryClient = useQueryClient();
  const { mutate, isPending: isStarting } = useLearnButtonMutation();
  const [commandId, setCommandId] = useState<string | null>(null);
  const command = useDeviceCommand(commandId);

  // The device's connection is stale on screen when it was unreachable.
  const refreshDevicesAfter = useCallback(
    (code: ApiErrorCode) => {
      if (isDeviceUnreachableCode(code)) {
        void queryClient.invalidateQueries({ queryKey: deviceKeys.lists() });
      }
    },
    [queryClient],
  );

  // The buttons are asked for again however it ended: a learn the app gave
  // up on (a network failure, a deadline passed in the background) may
  // still have been saved, and a retry would then hit BUTTON_NAME_TAKEN.
  const settle = useEffectEvent((errorCode: ApiErrorCode | undefined) => {
    void queryClient.invalidateQueries({
      queryKey: buttonKeys.list(remoteId),
    });
    if (errorCode) {
      refreshDevicesAfter(errorCode);
    }
    onDone();
  });
  const { status } = command;
  const errorCode = command.status === 'failed' ? command.errorCode : undefined;
  useEffect(() => {
    if (status === 'succeeded' || status === 'failed') {
      settle(errorCode);
    }
  }, [status, errorCode]);

  const learn = useCallback(
    (name: string) => {
      mutate(
        { remoteId, body: { name } },
        {
          onSuccess: (sent) => {
            setCommandId(sent.id);
          },
          onError: (error) => {
            refreshDevicesAfter(error.code);
            if (error.code === 'BUTTON_NAME_TAKEN') {
              onNameTaken();
            } else {
              onDone();
            }
          },
        },
      );
    },
    [mutate, remoteId, onDone, onNameTaken, refreshDevicesAfter],
  );

  return { isListening: isStarting || status === 'pending', learn };
}
