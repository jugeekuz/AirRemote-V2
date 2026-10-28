import { useFocusEffect } from '@react-navigation/native';

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

import { useDeviceList } from './use-device-list';

jest.mock('@api/devices');
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: jest.fn(),
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

beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(useFocusEffect).mockImplementation((callback) => {
    focusCallback = () => {
      callback();
    };
  });
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

  it('is not loaded when the first load failed', async () => {
    const offline: ApiError = {
      code: 'NETWORK_ERROR',
      message: 'Network Error',
      isNetworkError: true,
    };
    const queryClient = createTestQueryClient();
    api.list.mockRejectedValueOnce(offline);

    const { result } = await renderHook(() => useDeviceList(), {
      wrapper: createQueryWrapper(queryClient),
    });

    await waitFor(() => {
      expect(queryClient.getQueryState(['devices', 'list'])?.status).toBe(
        'error',
      );
    });
    expect(result.current.isLoaded).toBe(false);
    expect(result.current.devices).toEqual([]);
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
