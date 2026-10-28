import { useCallback, useEffect, useRef, useState } from 'react';

import { usePressButtonMutation } from '@queries/buttons';
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
 * one tap sends at most one command.
 */
export function usePressButton(buttonId: string): PressButton {
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
      onSettled: () => {
        setIsStarting(false);
      },
    });
  }, [buttonId, mutate, phase]);

  return { phase, press };
}
