import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { EnrollDeviceRequest } from '@airremote/contracts';

import { devicesApi } from '@api/devices';
import { buttonKeys } from '@queries/buttons';
import { remoteKeys } from '@queries/remotes';

import { deviceKeys } from './devices.queries';

// Every mutation here fails fast offline with NETWORK_ERROR instead of
// pausing (`networkMode: 'always'`): paused, the dialog would spin and the
// change would happen whenever the network came back.

/** Enrolls a board with its pairing code and refreshes the device lists. */
export function useEnrollDeviceMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: [...deviceKeys.all, 'enroll'],
    networkMode: 'always',
    mutationFn: (body: EnrollDeviceRequest) => devicesApi.enroll(body),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: deviceKeys.lists() }),
  });
}

/**
 * Deletes a device (the server deletes its remotes and buttons with it) and
 * refreshes the device, remote and buttons lists, after a failure too: a
 * 404 means the device is already gone.
 */
export function useDeleteDeviceMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: [...deviceKeys.all, 'delete'],
    networkMode: 'always',
    mutationFn: (deviceId: string) => devicesApi.delete(deviceId),
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: deviceKeys.lists() }),
        queryClient.invalidateQueries({ queryKey: remoteKeys.lists() }),
        queryClient.invalidateQueries({ queryKey: buttonKeys.lists() }),
      ]),
  });
}
