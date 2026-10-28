import type { PairingDetails } from '@app-types';
import { act, renderHook } from '@utils/tests';
import { pendingPairingStore } from '@stores/pending-pairing';

import { useAddDeviceDialog } from './use-add-device-dialog';

const PAIRING: PairingDetails = {
  macAddress: 'AA:BB:CC:DD:EE:01',
  pairingCode: '7K4MQ9TX',
};
const NO_LINK = {};

beforeEach(() => {
  pendingPairingStore.reset();
});

describe('useAddDeviceDialog', () => {
  it('starts closed', async () => {
    const { result } = await renderHook(() =>
      useAddDeviceDialog(NO_LINK, jest.fn()),
    );

    expect(result.current.isOpen).toBe(false);
    expect(result.current.pairing).toBeNull();
  });

  it('opens empty from the add button and closes', async () => {
    const { result } = await renderHook(() =>
      useAddDeviceDialog(NO_LINK, jest.fn()),
    );

    await act(async () => {
      result.current.open();
    });
    expect(result.current.isOpen).toBe(true);
    expect(result.current.pairing).toBeNull();

    await act(async () => {
      result.current.close();
    });
    expect(result.current.isOpen).toBe(false);
  });

  it('opens with the pairing link it was given, and lets it go on close', async () => {
    const onLinkDone = jest.fn();
    pendingPairingStore.set(PAIRING);

    const { result } = await renderHook(() =>
      useAddDeviceDialog(
        { pairMac: 'aa:bb:cc:dd:ee:01', pairCode: '7k4m-q9tx' },
        onLinkDone,
      ),
    );

    expect(result.current.isOpen).toBe(true);
    expect(result.current.pairing).toEqual(PAIRING);
    // The same link, kept while the session was being restored.
    expect(pendingPairingStore.getPending()).toBeNull();
    // Not yet: on web the link's restored state would overwrite it.
    expect(onLinkDone).not.toHaveBeenCalled();

    await act(async () => {
      result.current.close();
    });

    expect(result.current.isOpen).toBe(false);
    expect(onLinkDone).toHaveBeenCalledTimes(1);
  });

  it('does not open for an invalid pairing link', async () => {
    const { result } = await renderHook(() =>
      useAddDeviceDialog({ pairMac: 'nope', pairCode: '7K4MQ9TX' }, jest.fn()),
    );

    expect(result.current.isOpen).toBe(false);
  });

  it('opens with a pairing link that arrived before sign-in', async () => {
    pendingPairingStore.set(PAIRING);

    const { result } = await renderHook(() =>
      useAddDeviceDialog(NO_LINK, jest.fn()),
    );

    expect(result.current.isOpen).toBe(true);
    expect(result.current.pairing).toEqual(PAIRING);
    expect(pendingPairingStore.getPending()).toBeNull();
  });

  it('opens with a link that arrives while it is shown', async () => {
    const { result, rerender } = await renderHook(
      (link: { pairMac?: string; pairCode?: string }) =>
        useAddDeviceDialog(link, jest.fn()),
      { initialProps: NO_LINK },
    );
    expect(result.current.isOpen).toBe(false);

    await rerender({ pairMac: PAIRING.macAddress, pairCode: 'ZZZZ0000' });

    expect(result.current.pairing).toEqual({
      ...PAIRING,
      pairingCode: 'ZZZZ0000',
    });
  });
});
