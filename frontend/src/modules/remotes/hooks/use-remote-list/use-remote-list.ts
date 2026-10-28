import { useCallback } from 'react';
import { useIsFocused } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';

import type { DeviceResponse, RemoteResponse } from '@airremote/contracts';

import { deviceQueries } from '@queries/devices';
import { remoteQueries, useDeleteRemoteMutation } from '@queries/remotes';
import { useRefreshOnFocus } from '@hooks/use-refresh-on-focus';

const EMPTY_REMOTES: readonly RemoteResponse[] = Object.freeze([]);
const EMPTY_DEVICES: readonly DeviceResponse[] = Object.freeze([]);

type RemoteList = {
  /** The user's remotes; empty until the first load answers. */
  remotes: readonly RemoteResponse[];
  /** The user's devices, for each remote's online dot; empty until loaded. */
  devices: readonly DeviceResponse[];
  /** The remote list has answered at least once (it may be empty). */
  isLoaded: boolean;
  /** The first load of the remotes failed, so there is nothing to show. */
  isLoadFailed: boolean;
  /** Asks for the remotes again (the "Try again" button). */
  retry: () => void;
  /** Deletes a remote; the list drops it once the server agrees. */
  deleteRemote: (remoteId: string) => void;
};

/**
 * The Remotes screen's data: the remotes, the devices whose online status
 * their dots show, and deleting a remote. Both lists are asked for again
 * when the screen regains focus; the device list also every 30 s while
 * the screen is shown (the tabs keep it mounted, quiet, behind others).
 */
export function useRemoteList(): RemoteList {
  const isFocused = useIsFocused();
  const remoteList = useQuery({
    ...remoteQueries.list(),
    subscribed: isFocused,
  });
  const deviceList = useQuery({
    ...deviceQueries.list(),
    subscribed: isFocused,
  });
  const { mutate: deleteRemote } = useDeleteRemoteMutation();
  const { refetch: refetchRemotes } = remoteList;
  const { refetch: refetchDevices } = deviceList;

  const refetchBoth = useCallback(() => {
    void refetchRemotes();
    void refetchDevices();
  }, [refetchRemotes, refetchDevices]);
  useRefreshOnFocus(refetchBoth);

  const retry = useCallback(() => {
    void refetchRemotes();
  }, [refetchRemotes]);

  return {
    remotes: remoteList.data ?? EMPTY_REMOTES,
    devices: deviceList.data ?? EMPTY_DEVICES,
    isLoaded: remoteList.data !== undefined,
    isLoadFailed: remoteList.isError && remoteList.data === undefined,
    retry,
    deleteRemote,
  };
}
