import { useCallback } from 'react';
import { useIsFocused } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';

import type { DeviceResponse } from '@airremote/contracts';

import { deviceQueries, useDeleteDeviceMutation } from '@queries/devices';
import { useRefreshOnFocus } from '@hooks/use-refresh-on-focus';

const EMPTY_DEVICES: readonly DeviceResponse[] = Object.freeze([]);

type DeviceList = {
  /** The user's devices; empty until the first load answers. */
  devices: readonly DeviceResponse[];
  /** The list has answered at least once (it may be empty). */
  isLoaded: boolean;
  /** The first load failed, so there is nothing to show. */
  isLoadFailed: boolean;
  /** The first load waits for the network (offline): nothing to show yet. */
  isOffline: boolean;
  /** Asks for the list again (the "Try again" button). */
  retry: () => void;
  /** Deletes a device; the list drops it once the server agrees. */
  deleteDevice: (deviceId: string) => void;
};

/**
 * The Devices screen's data: the device list and deleting one. The list is
 * refetched every 30 s while the screen is shown (the tabs keep it mounted
 * behind other tabs, where it stays quiet) and when it regains focus, so
 * the online dots stay current. A failed first load shows the Error dialog
 * and `isLoadFailed`; a failed refetch keeps the last list. A first load
 * taken offline pauses until the network is back (`isOffline`).
 */
export function useDeviceList(): DeviceList {
  const isFocused = useIsFocused();
  const { data, isError, fetchStatus, refetch } = useQuery({
    ...deviceQueries.list(),
    subscribed: isFocused,
  });
  const { mutate: deleteDevice } = useDeleteDeviceMutation();
  useRefreshOnFocus(refetch);

  // A failed first load asked again offline waits too: it says so instead.
  const isOffline = fetchStatus === 'paused' && data === undefined;
  const retry = useCallback(() => {
    void refetch();
  }, [refetch]);

  return {
    devices: data ?? EMPTY_DEVICES,
    isLoaded: data !== undefined,
    isLoadFailed: isError && data === undefined && !isOffline,
    isOffline,
    retry,
    deleteDevice,
  };
}
