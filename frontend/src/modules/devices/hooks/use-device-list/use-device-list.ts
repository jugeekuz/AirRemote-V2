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
  /** Deletes a device; the list drops it once the server agrees. */
  deleteDevice: (deviceId: string) => void;
};

/**
 * The Devices screen's data: the device list (refetched every 30 s and when
 * the screen regains focus, so the online dots stay current) and deleting
 * one. Failures show the Error dialog through the query client.
 */
export function useDeviceList(): DeviceList {
  const { data, refetch } = useQuery(deviceQueries.list());
  const { mutate: deleteDevice } = useDeleteDeviceMutation();
  useRefreshOnFocus(refetch);

  return {
    devices: data ?? EMPTY_DEVICES,
    isLoaded: data !== undefined,
    deleteDevice,
  };
}
