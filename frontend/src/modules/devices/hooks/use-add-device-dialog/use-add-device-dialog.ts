import { useCallback, useEffect, useState } from 'react';

import type { DevicesStackParamList, PairingDetails } from '@app-types';
import { pendingPairingStore } from '@stores/pending-pairing';
import { getPairingDetails } from '@modules/devices/helpers/pairing';

/** The device list's route params a pairing link sets. */
export type PairingLinkParams = NonNullable<
  DevicesStackParamList['DeviceList']
>;

type AddDeviceDialogState = {
  isOpen: boolean;
  /** Set when a pairing link opened it: the dialog starts at the name. */
  pairing: PairingDetails | null;
};

const CLOSED: AddDeviceDialogState = { isOpen: false, pairing: null };

/**
 * Whether the Add device dialog is open, and with which pairing. A pairing
 * link opens it filled in: one in the route params, or one that arrived
 * before sign-in (`pendingPairingStore`, cleared here).
 *
 * `onLinkDone` clears the route params when the dialog closes. Not sooner:
 * on web, a link that opens the app is still being restored into the
 * navigation state when the screen mounts, and a change made then is
 * overwritten.
 */
export function useAddDeviceDialog(
  { pairMac, pairCode }: PairingLinkParams,
  onLinkDone: () => void,
): {
  isOpen: boolean;
  pairing: PairingDetails | null;
  open: () => void;
  close: () => void;
} {
  const [state, setState] = useState<AddDeviceDialogState>(CLOSED);
  const pending = pendingPairingStore.usePending();
  const hasLink = pairMac !== undefined || pairCode !== undefined;
  const incoming = hasLink ? getPairingDetails(pairMac, pairCode) : pending;
  const incomingKey = incoming
    ? `${incoming.macAddress}/${incoming.pairingCode}`
    : null;
  const [openedKey, setOpenedKey] = useState<string | null>(null);

  // A new pairing opens the dialog filled in, once (adjusting state while
  // rendering, as React recommends over an effect).
  if (incomingKey !== openedKey) {
    setOpenedKey(incomingKey);
    if (incoming) {
      setState({ isOpen: true, pairing: incoming });
    }
  }

  useEffect(() => {
    if (hasLink) {
      // The link may also have been kept while the session was restored.
      pendingPairingStore.clear();
    }
  }, [hasLink, pairMac, pairCode]);

  useEffect(() => {
    if (pending) {
      pendingPairingStore.clear();
    }
  }, [pending]);

  const open = useCallback(() => {
    setState({ isOpen: true, pairing: null });
  }, []);
  const close = useCallback(() => {
    setState(CLOSED);
    if (hasLink) {
      onLinkDone();
    }
  }, [hasLink, onLinkDone]);

  return { ...state, open, close };
}
