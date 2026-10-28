import { useCallback, useEffect, useEffectEvent, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { buttonKeys, useLearnButtonMutation } from '@queries/buttons';
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
 * and the command is followed until the device settles it. A failure's
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

  const settle = useEffectEvent((isSucceeded: boolean) => {
    if (isSucceeded) {
      void queryClient.invalidateQueries({
        queryKey: buttonKeys.list(remoteId),
      });
    }
    onDone();
  });
  const { status } = command;
  useEffect(() => {
    if (status === 'succeeded' || status === 'failed') {
      settle(status === 'succeeded');
    }
  }, [status]);

  const learn = useCallback(
    (name: string) => {
      mutate(
        { remoteId, body: { name } },
        {
          onSuccess: (sent) => {
            setCommandId(sent.id);
          },
          onError: (error) => {
            if (error.code === 'BUTTON_NAME_TAKEN') {
              onNameTaken();
            } else {
              onDone();
            }
          },
        },
      );
    },
    [mutate, remoteId, onDone, onNameTaken],
  );

  return { isListening: isStarting || status === 'pending', learn };
}
