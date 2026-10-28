import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { onlineManager } from '@tanstack/react-query';

import type { DeviceResponse } from '@airremote/contracts';

import type { ApiError } from '@app-types';
import {
  act,
  createQueryWrapper,
  createTestQueryClient,
  renderHook,
  waitFor,
} from '@utils/tests';
import { devicesApi } from '@api/devices';
import { DEVICE_LIST_REFETCH_MS } from '@queries/devices';

import { useDeviceList } from './use-device-list';

jest.mock('@api/devices');
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: jest.fn(),
  useIsFocused: jest.fn(),
}));

const api = jest.mocked(devicesApi);
const desk: DeviceResponse = {
  id: '6f1c0d4e-9a43-4c1b-8d4e-2f0a1b2c3d4e',
  macAddress: 'aa:bb:cc:dd:ee:01',
  name: 'Desk',
  online: true,
};
const hall: DeviceResponse = {
  id: '0b6a3c1e-2f4d-4e5a-9b8c-7d6e5f4a3b2c',
  macAddress: 'aa:bb:cc:dd:ee:02',
  name: 'Hall',
  online: false,
};

// The mock keeps the latest focus callback; `focus()` stands in for the
// screen gaining focus.
let focusCallback: () => void = () => {};

async function focus() {
  await act(async () => {
    focusCallback();
  });
}

const offline: ApiError = {
  code: 'NETWORK_ERROR',
  message: 'Network Error',
  isNetworkError: true,
};

beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(useIsFocused).mockReturnValue(true);
  jest.mocked(useFocusEffect).mockImplementation((callback) => {
    focusCallback = () => {
      callback();
    };
  });
});

afterEach(() => {
  onlineManager.setOnline(true);
});
describe('useDeviceList', () => {
  it('is empty while the first load runs', async () => {
    api.list.mockReturnValueOnce(new Promise(() => {}));

    const { result } = await renderHook(() => useDeviceList(), {
      wrapper: createQueryWrapper(),
    });

    expect(result.current.devices).toEqual([]);
    expect(result.current.isLoaded).toBe(false);
  });

  // Paused until the network is back: the screen says why it is empty.
  it('says when the first load waits for the network', async () => {
    onlineManager.setOnline(false);
    api.list.mockResolvedValue([desk]);

    const { result } = await renderHook(() => useDeviceList(), {
      wrapper: createQueryWrapper(),
    });

    expect(result.current.isOffline).toBe(true);
    expect(result.current.isLoaded).toBe(false);
    expect(api.list).not.toHaveBeenCalled();

    await act(async () => {
      onlineManager.setOnline(true);
    });

    await waitFor(() => {
      expect(result.current.isLoaded).toBe(true);
    });
    expect(result.current.isOffline).toBe(false);
  });

  it('is not offline once it has devices to show', async () => {
    api.list.mockResolvedValue([desk]);
    const { result } = await renderHook(() => useDeviceList(), {
      wrapper: createQueryWrapper(),
    });
    await waitFor(() => {
      expect(result.current.isLoaded).toBe(true);
    });

    await act(async () => {
      onlineManager.setOnline(false);
    });
    await focus();

    expect(result.current.isOffline).toBe(false);
    expect(result.current.devices).toEqual([desk]);
  });

  it('gives the devices once loaded', async () => {
    api.list.mockResolvedValueOnce([desk, hall]);

    const { result } = await renderHook(() => useDeviceList(), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoaded).toBe(true);
    });
    expect(result.current.devices).toEqual([desk, hall]);
  });

  it('says when the first load failed, and tries again', async () => {
    api.list.mockRejectedValueOnce(offline).mockResolvedValueOnce([desk]);

    const { result } = await renderHook(() => useDeviceList(), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoadFailed).toBe(true);
    });
    expect(result.current.isLoaded).toBe(false);
    expect(result.current.devices).toEqual([]);

    await act(async () => {
      result.current.retry();
    });

    await waitFor(() => {
      expect(result.current.devices).toEqual([desk]);
    });
    expect(result.current.isLoadFailed).toBe(false);
    expect(result.current.isLoaded).toBe(true);
  });

  it('keeps the devices when a later refetch fails', async () => {
    api.list.mockResolvedValueOnce([desk]).mockRejectedValueOnce(offline);

    const { result } = await renderHook(() => useDeviceList(), {
      wrapper: createQueryWrapper(),
    });
    await waitFor(() => {
      expect(result.current.isLoaded).toBe(true);
    });

    await act(async () => {
      result.current.retry();
    });

    await waitFor(() => {
      expect(api.list).toHaveBeenCalledTimes(2);
    });
    expect(result.current.devices).toEqual([desk]);
    expect(result.current.isLoadFailed).toBe(false);
  });

  // Bottom tabs keep the screen mounted; it must not poll from behind.
  describe('while the screen is not shown', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('stops asking every 30 seconds', async () => {
      api.list.mockResolvedValue([desk]);
      const { result, rerender } = await renderHook(() => useDeviceList(), {
        wrapper: createQueryWrapper(createTestQueryClient()),
      });
      await waitFor(() => {
        expect(result.current.isLoaded).toBe(true);
      });

      jest.mocked(useIsFocused).mockReturnValue(false);
      await rerender({});
      await act(async () => {
        jest.advanceTimersByTime(DEVICE_LIST_REFETCH_MS * 3);
      });

      expect(api.list).toHaveBeenCalledTimes(1);
    });
  });

  it('asks again when the screen regains focus', async () => {
    api.list.mockResolvedValueOnce([desk, hall]).mockResolvedValueOnce([desk]);

    const { result } = await renderHook(() => useDeviceList(), {
      wrapper: createQueryWrapper(),
    });
    await waitFor(() => {
      expect(result.current.devices).toHaveLength(2);
    });

    await focus();
    await focus();

    await waitFor(() => {
      expect(result.current.devices).toEqual([desk]);
    });
  });

  it('deletes a device, and the list drops it', async () => {
    api.list.mockResolvedValueOnce([desk, hall]).mockResolvedValueOnce([desk]);
    api.delete.mockResolvedValueOnce(undefined);

    const { result } = await renderHook(() => useDeviceList(), {
      wrapper: createQueryWrapper(),
    });
    await waitFor(() => {
      expect(result.current.devices).toHaveLength(2);
    });

    await act(async () => {
      result.current.deleteDevice(hall.id);
    });

    await waitFor(() => {
      expect(result.current.devices).toEqual([desk]);
    });
    expect(api.delete).toHaveBeenCalledWith(hall.id);
  });
});
