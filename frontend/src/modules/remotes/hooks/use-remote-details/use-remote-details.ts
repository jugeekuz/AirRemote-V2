import { useCallback, useEffect } from 'react';
import { useIsFocused } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';

import type {
  ButtonResponse,
  DeviceResponse,
  RemoteResponse,
} from '@airremote/contracts';

import { buttonQueries, useDeleteButtonMutation } from '@queries/buttons';
import { deviceQueries } from '@queries/devices';
import { remoteQueries } from '@queries/remotes';
import { useRefreshOnFocus } from '@hooks/use-refresh-on-focus';
import { getRemoteDevice } from '@modules/remotes/helpers/remotes';

const EMPTY_BUTTONS: readonly ButtonResponse[] = Object.freeze([]);
const NO_DEVICES: readonly DeviceResponse[] = Object.freeze([]);

/** What failed to load the first time: the remote list, or its buttons. */
export type RemoteDetailsLoadFailure = 'remote' | 'buttons';

type RemoteDetails = {
  /** The remote, once the remote list has it. */
  remote: RemoteResponse | undefined;
  /** Its device (name, MAC, online), once the device list has it. */
  device: DeviceResponse | undefined;
  /** The remote's buttons; empty until they load. */
  buttons: readonly ButtonResponse[];
  /** The buttons have loaded at least once (they may be none). */
  isLoaded: boolean;
  /**
   * The remote list has loaded and this remote isn't in it: deleted (with
   * its device, or from another screen), or an id that never was one.
   */
  isMissing: boolean;
  /** What failed to load the first time (nothing to show), if anything. */
  loadFailure: RemoteDetailsLoadFailure | null;
  /** Asks again for what failed to load (the "Try again" button). */
  retry: () => void;
  /** Deletes a button; the list drops it once the server agrees. */
  deleteButton: (buttonId: string) => void;
};

/**
 * Remote details' data. There is no get-by-id for a remote: it is found in
 * the remote list, and its device in the device list (which polls every
 * 30 s while the screen is shown, for the online status). Its buttons are
 * asked for once the remote is known to exist. Everything is asked for
 * again when the screen regains focus.
 */
export function useRemoteDetails(remoteId: string): RemoteDetails {
  const isFocused = useIsFocused();
  const remoteList = useQuery({
    ...remoteQueries.list(),
    subscribed: isFocused,
  });
  const deviceList = useQuery({
    ...deviceQueries.list(),
    subscribed: isFocused,
  });
  const remote = remoteList.data?.find(({ id }) => id === remoteId);
  const buttonList = useQuery({
    ...buttonQueries.list(remoteId),
    enabled: remote !== undefined,
    subscribed: isFocused,
  });
  const { mutate: deleteButton } = useDeleteButtonMutation();
  const device = remote
    ? getRemoteDevice(remote, deviceList.data ?? NO_DEVICES)
    : undefined;
  const { refetch: refetchRemotes } = remoteList;
  const { refetch: refetchDevices } = deviceList;
  const { refetch: refetchButtons } = buttonList;

  // A device that left the device list was deleted, with its remotes: the
  // remote list says so once asked again.
  const isDeviceGone = remote !== undefined && deviceList.isSuccess && !device;
  useEffect(() => {
    if (isDeviceGone) {
      void refetchRemotes();
    }
  }, [isDeviceGone, refetchRemotes]);

  // The buttons only once the remote list says it still exists: asking a
  // deleted remote for its buttons would only answer 404.
  const refetchAll = useCallback(() => {
    void refetchDevices();
    void refetchRemotes().then(({ data }) => {
      if (data?.some(({ id }) => id === remoteId)) {
        void refetchButtons();
      }
    });
  }, [refetchRemotes, refetchDevices, refetchButtons, remoteId]);
  useRefreshOnFocus(refetchAll);

  const isRemotesLoadFailed =
    remoteList.isError && remoteList.data === undefined;
  const isButtonsLoadFailed =
    buttonList.isError && buttonList.data === undefined;
  const retry = useCallback(() => {
    if (isRemotesLoadFailed) {
      void refetchRemotes();
    }
    if (isButtonsLoadFailed) {
      void refetchButtons();
    }
  }, [
    isRemotesLoadFailed,
    isButtonsLoadFailed,
    refetchRemotes,
    refetchButtons,
  ]);

  return {
    remote,
    device,
    buttons: remote ? (buttonList.data ?? EMPTY_BUTTONS) : EMPTY_BUTTONS,
    isLoaded: remote !== undefined && buttonList.data !== undefined,
    isMissing: remoteList.data !== undefined && remote === undefined,
    loadFailure: isRemotesLoadFailed
      ? 'remote'
      : isButtonsLoadFailed
        ? 'buttons'
        : null,
    retry,
    deleteButton,
  };
}
