import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { EnrollDeviceRequest } from '@airremote/contracts';

import { devicesApi } from '@api/devices';
import { remoteKeys } from '@queries/remotes';

import { deviceKeys } from './devices.queries';

/** Enrolls a board with its pairing code and refreshes the device lists. */
export function useEnrollDeviceMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: [...deviceKeys.all, 'enroll'],
    mutationFn: (body: EnrollDeviceRequest) => devicesApi.enroll(body),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: deviceKeys.lists() }),
  });
}

/**
 * Deletes a device (the server deletes its remotes and buttons with it) and
 * refreshes the device and remote lists, after a failure too: a 404 means
 * the device is already gone. Buttons lists join the invalidation once
 * their queries exist.
 */
export function useDeleteDeviceMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: [...deviceKeys.all, 'delete'],
    mutationFn: (deviceId: string) => devicesApi.delete(deviceId),
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: deviceKeys.lists() }),
        queryClient.invalidateQueries({ queryKey: remoteKeys.lists() }),
      ]),
  });
}
