import { act, renderHook } from '@testing-library/react-native';

import type { PairingDetails } from '@app-types';

import { pendingPairingStore } from './pending-pairing.store';

const PAIRING: PairingDetails = {
  macAddress: 'AA:BB:CC:DD:EE:01',
  pairingCode: '7K4MQ9TX',
};

beforeEach(() => {
  pendingPairingStore.reset();
});

describe('pendingPairingStore', () => {
  it('starts with nothing pending', () => {
    expect(pendingPairingStore.getPending()).toBeNull();
    expect(pendingPairingStore.take()).toBeNull();
  });

  it('keeps a pairing until it is taken, once', () => {
    pendingPairingStore.set(PAIRING);

    expect(pendingPairingStore.getPending()).toEqual(PAIRING);
    expect(pendingPairingStore.take()).toEqual(PAIRING);
    expect(pendingPairingStore.take()).toBeNull();
    expect(pendingPairingStore.getPending()).toBeNull();
  });

  it('keeps only the latest pairing', () => {
    const other = { ...PAIRING, pairingCode: 'ZZZZ0000' };
    pendingPairingStore.set(PAIRING);
    pendingPairingStore.set(other);

    expect(pendingPairingStore.take()).toEqual(other);
  });

  it('clear drops it', () => {
    pendingPairingStore.set(PAIRING);

    pendingPairingStore.clear();

    expect(pendingPairingStore.getPending()).toBeNull();
  });

  it('usePending re-renders when a pairing arrives and goes', async () => {
    const { result } = await renderHook(() => pendingPairingStore.usePending());
    expect(result.current).toBeNull();

    await act(async () => {
      pendingPairingStore.set(PAIRING);
    });
    expect(result.current).toEqual(PAIRING);

    await act(async () => {
      pendingPairingStore.clear();
    });
    expect(result.current).toBeNull();
  });
});
