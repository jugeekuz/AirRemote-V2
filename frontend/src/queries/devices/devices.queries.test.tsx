import { useQuery } from '@tanstack/react-query';

import type { DeviceResponse } from '@airremote/contracts';

import type { ApiError } from '@app-types';
import { act, createQueryWrapper, renderHook, waitFor } from '@utils/tests';
import { devicesApi } from '@api/devices';

import { DEVICE_LIST_REFETCH_MS } from './devices.constants';
import { deviceKeys, deviceQueries } from './devices.queries';

jest.mock('@api/devices');

const api = jest.mocked(devicesApi);
const device: DeviceResponse = {
  id: '6f1c0d4e-9a43-4c1b-8d4e-2f0a1b2c3d4e',
  macAddress: 'aa:bb:cc:dd:ee:01',
  name: 'Living room',
  online: true,
};

beforeEach(() => {
  jest.resetAllMocks();
});

describe('deviceKeys', () => {
  it('nests every key under the domain', () => {
    expect(deviceKeys.all).toEqual(['devices']);
    expect(deviceKeys.lists()).toEqual(['devices', 'list']);
  });
});

describe('deviceQueries.list', () => {
  it('loads the devices, passing the cancellation signal on', async () => {
    api.list.mockResolvedValueOnce([device]);

    const { result } = await renderHook(() => useQuery(deviceQueries.list()), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(result.current.data).toEqual([device]);
    expect(api.list).toHaveBeenCalledWith({ signal: expect.any(AbortSignal) });
  });

  it('exposes the ApiError of a failed load', async () => {
    const apiError: ApiError = {
      code: 'NETWORK_ERROR',
      message: 'Network Error',
      isNetworkError: true,
    };
    api.list.mockRejectedValueOnce(apiError);

    const { result } = await renderHook(() => useQuery(deviceQueries.list()), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
    expect(result.current.error).toBe(apiError);
  });

  describe('online status', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('asks again every 30 seconds, so a device going offline shows up', async () => {
      expect(DEVICE_LIST_REFETCH_MS).toBe(30_000);
      api.list
        .mockResolvedValueOnce([device])
        .mockResolvedValueOnce([{ ...device, online: false }]);

      const { result } = await renderHook(
        () => useQuery(deviceQueries.list()),
        { wrapper: createQueryWrapper() },
      );
      await waitFor(() => {
        expect(result.current.data?.[0]?.online).toBe(true);
      });

      expect(api.list).toHaveBeenCalledTimes(1);

      await act(async () => {
        jest.advanceTimersByTime(DEVICE_LIST_REFETCH_MS);
      });
      await waitFor(() => {
        expect(result.current.data?.[0]?.online).toBe(false);
      });
      expect(api.list).toHaveBeenCalledTimes(2);
    });

    // Nothing to keep current yet; the screen offers "Try again" instead.
    it('does not poll after a failed first load', async () => {
      api.list.mockRejectedValue({
        code: 'NETWORK_ERROR',
        message: 'Network Error',
        isNetworkError: true,
      });

      const { result } = await renderHook(
        () => useQuery({ ...deviceQueries.list(), retry: false }),
        { wrapper: createQueryWrapper() },
      );
      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      await act(async () => {
        jest.advanceTimersByTime(DEVICE_LIST_REFETCH_MS * 3);
      });
      expect(api.list).toHaveBeenCalledTimes(1);
    });
  });
});
