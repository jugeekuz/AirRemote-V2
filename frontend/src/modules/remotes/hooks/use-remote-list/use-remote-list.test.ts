import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { onlineManager } from '@tanstack/react-query';

import type { DeviceResponse, RemoteResponse } from '@airremote/contracts';

import type { ApiError } from '@app-types';
import {
  act,
  createQueryWrapper,
  createTestQueryClient,
  renderHook,
  waitFor,
} from '@utils/tests';
import { devicesApi } from '@api/devices';
import { remotesApi } from '@api/remotes';
import { DEVICE_LIST_REFETCH_MS } from '@queries/devices';

import { useRemoteList } from './use-remote-list';

jest.mock('@api/devices');
jest.mock('@api/remotes');
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: jest.fn(),
  useIsFocused: jest.fn(),
}));

const devices = jest.mocked(devicesApi);
const remotes = jest.mocked(remotesApi);
const desk: DeviceResponse = {
  id: '6f1c0d4e-9a43-4c1b-8d4e-2f0a1b2c3d4e',
  macAddress: 'aa:bb:cc:dd:ee:01',
  name: 'Desk',
  online: true,
};
const ac: RemoteResponse = {
  id: '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d',
  deviceId: desk.id,
  name: 'AC',
  type: 'air_conditioner',
};
const tv: RemoteResponse = {
  id: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
  deviceId: desk.id,
  name: 'TV',
  type: 'smart_tv',
};
const offline: ApiError = {
  code: 'NETWORK_ERROR',
  message: 'Network Error',
  isNetworkError: true,
};

// The mock keeps the latest focus callback; `focus()` stands in for the
// screen gaining focus.
let focusCallback: () => void = () => {};

async function focus() {
  await act(async () => {
    focusCallback();
  });
}

beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(useIsFocused).mockReturnValue(true);
  jest.mocked(useFocusEffect).mockImplementation((callback) => {
    focusCallback = () => {
      callback();
    };
  });
  devices.list.mockResolvedValue([desk]);
});

afterEach(() => {
  onlineManager.setOnline(true);
});
describe('useRemoteList', () => {
  it('is empty while the first load runs', async () => {
    remotes.list.mockReturnValueOnce(new Promise(() => {}));

    const { result } = await renderHook(() => useRemoteList(), {
      wrapper: createQueryWrapper(),
    });

    expect(result.current.remotes).toEqual([]);
    expect(result.current.isLoaded).toBe(false);
    expect(result.current.isLoadFailed).toBe(false);
  });

  // Paused until the network is back: the screen says why it is empty.
  it('says when the first load waits for the network', async () => {
    onlineManager.setOnline(false);
    remotes.list.mockResolvedValue([ac]);
    devices.list.mockResolvedValue([desk]);

    const { result } = await renderHook(() => useRemoteList(), {
      wrapper: createQueryWrapper(),
    });

    expect(result.current.isOffline).toBe(true);
    expect(remotes.list).not.toHaveBeenCalled();

    await act(async () => {
      onlineManager.setOnline(true);
    });

    await waitFor(() => {
      expect(result.current.isLoaded).toBe(true);
    });
    expect(result.current.isOffline).toBe(false);
  });

  it('gives the remotes and the devices they use once loaded', async () => {
    remotes.list.mockResolvedValueOnce([ac, tv]);

    const { result } = await renderHook(() => useRemoteList(), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoaded).toBe(true);
    });
    expect(result.current.remotes).toEqual([ac, tv]);
    await waitFor(() => {
      expect(result.current.devices).toEqual([desk]);
    });
  });

  it('says when the first load failed, and tries again', async () => {
    remotes.list.mockRejectedValueOnce(offline).mockResolvedValueOnce([ac]);

    const { result } = await renderHook(() => useRemoteList(), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoadFailed).toBe(true);
    });
    expect(result.current.isLoaded).toBe(false);

    await act(async () => {
      result.current.retry();
    });

    await waitFor(() => {
      expect(result.current.remotes).toEqual([ac]);
    });
    expect(result.current.isLoadFailed).toBe(false);
  });

  it('asks for both lists again when the screen regains focus', async () => {
    remotes.list.mockResolvedValueOnce([ac, tv]).mockResolvedValueOnce([ac]);

    const { result } = await renderHook(() => useRemoteList(), {
      wrapper: createQueryWrapper(),
    });
    await waitFor(() => {
      expect(result.current.remotes).toHaveLength(2);
    });
    await waitFor(() => {
      expect(devices.list).toHaveBeenCalledTimes(1);
    });

    await focus();
    await focus();

    await waitFor(() => {
      expect(result.current.remotes).toEqual([ac]);
    });
    expect(devices.list).toHaveBeenCalledTimes(2);
  });

  it('deletes a remote, and the list drops it', async () => {
    remotes.list.mockResolvedValueOnce([ac, tv]).mockResolvedValueOnce([ac]);
    remotes.delete.mockResolvedValueOnce(undefined);

    const { result } = await renderHook(() => useRemoteList(), {
      wrapper: createQueryWrapper(),
    });
    await waitFor(() => {
      expect(result.current.remotes).toHaveLength(2);
    });

    await act(async () => {
      result.current.deleteRemote(tv.id);
    });

    await waitFor(() => {
      expect(result.current.remotes).toEqual([ac]);
    });
    expect(remotes.delete).toHaveBeenCalledWith(tv.id);
  });

  // The online dots: the device list polls while the screen is shown.
  describe('online status', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('asks for the devices every 30 seconds while shown, not after', async () => {
      remotes.list.mockResolvedValue([ac]);
      const { result, rerender } = await renderHook(() => useRemoteList(), {
        wrapper: createQueryWrapper(createTestQueryClient()),
      });
      await waitFor(() => {
        expect(result.current.devices).toEqual([desk]);
      });

      await act(async () => {
        jest.advanceTimersByTime(DEVICE_LIST_REFETCH_MS);
      });
      await waitFor(() => {
        expect(devices.list).toHaveBeenCalledTimes(2);
      });

      jest.mocked(useIsFocused).mockReturnValue(false);
      await rerender({});
      await act(async () => {
        jest.advanceTimersByTime(DEVICE_LIST_REFETCH_MS * 3);
      });
      expect(devices.list).toHaveBeenCalledTimes(2);
    });
  });
});
