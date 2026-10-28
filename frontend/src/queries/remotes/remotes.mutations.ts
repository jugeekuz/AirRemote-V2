import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { CreateRemoteRequest } from '@airremote/contracts';

import { remotesApi } from '@api/remotes';
import { buttonKeys } from '@queries/buttons';

import { remoteKeys } from './remotes.queries';

type CreateRemoteVariables = {
  /** The device whose IR transmitter the remote uses. */
  deviceId: string;
  body: CreateRemoteRequest;
};

/**
 * Creates a remote on a device and refreshes the remote lists, after a
 * failure too (a taken name or a deleted device says the list is stale).
 */
export function useCreateRemoteMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: [...remoteKeys.all, 'create'],
    mutationFn: ({ deviceId, body }: CreateRemoteVariables) =>
      remotesApi.create(deviceId, body),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: remoteKeys.lists() }),
  });
}

/**
 * Deletes a remote (the server deletes its buttons with it) and refreshes
 * the remote and buttons lists, after a failure too: a 404 means it is
 * already gone.
 */
export function useDeleteRemoteMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: [...remoteKeys.all, 'delete'],
    mutationFn: (remoteId: string) => remotesApi.delete(remoteId),
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: remoteKeys.lists() }),
        queryClient.invalidateQueries({ queryKey: buttonKeys.lists() }),
      ]),
  });
}
