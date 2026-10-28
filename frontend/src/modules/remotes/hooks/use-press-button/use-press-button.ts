import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import type { ApiErrorCode } from '@app-types';
import { usePressButtonMutation } from '@queries/buttons';
import { deviceKeys } from '@queries/devices';
import { isDeviceUnreachableCode } from '@helpers/device-commands';
import { useDeviceCommand } from '@hooks/use-device-command';

import { PRESS_SUCCESS_MS } from './use-press-button.constants';

/** What the press control shows: Power, the spinner, or the tick. */
export type PressPhase = 'idle' | 'pending' | 'succeeded';

type PressButton = {
  phase: PressPhase;
  /** Sends the button's code; ignored unless the control is idle. */
  press: () => void;
};

/**
 * Pressing one button: the press goes to the device as a command, which is
 * followed until the device settles it. Succeeded shows for V1's 800 ms,
 * then the control is idle again; a failure goes straight back to idle,
 * its Error dialog opened by `useDeviceCommand` (one refused up front by the
 * global mutation error handler). Taps while it is not idle are ignored, so
 * one tap sends at most one command. When the device turns out to be
 * unreachable, the devices are asked for again, so the status shown is too.
 */
export function usePressButton(buttonId: string): PressButton {
  const queryClient = useQueryClient();
  const { mutate } = usePressButtonMutation();
  const [isStarting, setIsStarting] = useState(false);
  const [commandId, setCommandId] = useState<string | null>(null);
  const [shownId, setShownId] = useState<string | null>(null);
  const command = useDeviceCommand(commandId);
  // Two taps in one moment both see the last render's phase.
  const isBusyRef = useRef(false);

  let phase: PressPhase = 'idle';
  if (isStarting || command.status === 'pending') {
    phase = 'pending';
  } else if (command.status === 'succeeded' && shownId !== commandId) {
    phase = 'succeeded';
  }

  const isSucceeded = command.status === 'succeeded';
  useEffect(() => {
    if (!isSucceeded || commandId === null) {
      return;
    }
    const timer = setTimeout(() => {
      setShownId(commandId);
    }, PRESS_SUCCESS_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [isSucceeded, commandId]);

  // An unreachable device makes the online status on screen stale.
  const refreshDevicesAfter = useCallback(
    (code: ApiErrorCode) => {
      if (isDeviceUnreachableCode(code)) {
        void queryClient.invalidateQueries({ queryKey: deviceKeys.lists() });
      }
    },
    [queryClient],
  );
  const errorCode = command.status === 'failed' ? command.errorCode : undefined;
  useEffect(() => {
    if (errorCode) {
      refreshDevicesAfter(errorCode);
    }
  }, [commandId, errorCode, refreshDevicesAfter]);

  useEffect(() => {
    if (phase === 'idle') {
      isBusyRef.current = false;
    }
  }, [phase]);

  const press = useCallback(() => {
    if (isBusyRef.current || phase !== 'idle') {
      return;
    }
    isBusyRef.current = true;
    setIsStarting(true);
    mutate(buttonId, {
      onSuccess: (sent) => {
        setCommandId(sent.id);
      },
      onError: (error) => {
        refreshDevicesAfter(error.code);
      },
      onSettled: () => {
        setIsStarting(false);
      },
    });
  }, [buttonId, mutate, phase, refreshDevicesAfter]);

  return { phase, press };
}
