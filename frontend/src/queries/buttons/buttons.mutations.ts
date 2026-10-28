import { useMutation, useQueryClient } from '@tanstack/react-query';

import type {
  DeviceCommandResponse,
  LearnButtonRequest,
} from '@airremote/contracts';

import { buttonsApi } from '@api/buttons';
import { deviceCommandKeys } from '@queries/device-commands';

import { buttonKeys } from './buttons.queries';

type LearnButtonVariables = {
  /** The remote the new button belongs to. */
  remoteId: string;
  body: LearnButtonRequest;
};

/**
 * Starts learning a button: the device listens for a physical remote. The
 * 202's pending command seeds `deviceCommandQueries.detail(id)`, so its
 * poll starts from it; whoever waits for the command refreshes the
 * remote's buttons once it succeeds.
 */
export function useLearnButtonMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: [...buttonKeys.all, 'learn'],
    mutationFn: ({ remoteId, body }: LearnButtonVariables) =>
      buttonsApi.learn(remoteId, body),
    onSuccess: (command: DeviceCommandResponse) => {
      queryClient.setQueryData(deviceCommandKeys.detail(command.id), command);
    },
  });
}

/**
 * Presses a button: the device sends its IR code. The 202's pending
 * command seeds `deviceCommandQueries.detail(id)`, so its poll starts from it.
 */
export function usePressButtonMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: [...buttonKeys.all, 'press'],
    mutationFn: (buttonId: string) => buttonsApi.press(buttonId),
    onSuccess: (command: DeviceCommandResponse) => {
      queryClient.setQueryData(deviceCommandKeys.detail(command.id), command);
    },
  });
}

/**
 * Deletes a button and refreshes the buttons lists, after a failure too: a
 * 404 means it is already gone.
 */
export function useDeleteButtonMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: [...buttonKeys.all, 'delete'],
    mutationFn: (buttonId: string) => buttonsApi.delete(buttonId),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: buttonKeys.lists() }),
  });
}
