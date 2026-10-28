import { create } from 'zustand';

import type { PairingDetails } from '@app-types';

type PendingPairingState = {
  pending: PairingDetails | null;
};

const INITIAL_PENDING_PAIRING_STATE: PendingPairingState = {
  pending: null,
};

const usePendingPairingStore = create<PendingPairingState>()(
  () => INITIAL_PENDING_PAIRING_STATE,
);

/**
 * A pairing link (`airremote://pair?mac=…&code=…`) that arrived before the
 * user was signed in, kept until the device list takes it after sign-in.
 * In memory only, and not reset on sign-out: signing out is what happens
 * when a launch finds no session, which is when such a link arrives.
 */
export const pendingPairingStore = {
  set(pairing: PairingDetails) {
    usePendingPairingStore.setState({ pending: pairing });
  },
  /** The pending pairing, which is then no longer pending. */
  take(): PairingDetails | null {
    const { pending } = usePendingPairingStore.getState();
    usePendingPairingStore.setState({ pending: null });
    return pending;
  },
  clear() {
    usePendingPairingStore.setState({ pending: null });
  },
  reset() {
    usePendingPairingStore.setState(INITIAL_PENDING_PAIRING_STATE);
  },

  getPending: () => usePendingPairingStore.getState().pending,

  usePending: () => usePendingPairingStore((state) => state.pending),
};
