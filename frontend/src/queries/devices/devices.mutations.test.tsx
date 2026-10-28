import { onlineManager } from '@tanstack/react-query';

import type { DeviceResponse, EnrollDeviceRequest } from '@airremote/contracts';

import type { ApiError } from '@app-types';
import {
  act,
  createQueryWrapper,
  createTestQueryClient,
  renderHook,
  waitFor,
} from '@utils/tests';
import { devicesApi } from '@api/devices';
import { buttonKeys } from '@queries/buttons';
import { remoteKeys } from '@queries/remotes';

import {
  useDeleteDeviceMutation,
  useEnrollDeviceMutation,
} from './devices.mutations';
import { deviceKeys } from './devices.queries';

jest.mock('@api/devices');

const api = jest.mocked(devicesApi);
const device: DeviceResponse = {
  id: '6f1c0d4e-9a43-4c1b-8d4e-2f0a1b2c3d4e',
  macAddress: 'aa:bb:cc:dd:ee:01',
  name: 'Living room',
  online: false,
};
const enrollBody: EnrollDeviceRequest = {
  macAddress: 'AA:BB:CC:DD:EE:01',
  pairingCode: '7K4MQ9TX',
  name: 'Living room',
};
const notFound: ApiError = {
  status: 404,
  code: 'NOT_FOUND',
  message: 'Not found',
  isNetworkError: false,
};

const unreachable: ApiError = {
  code: 'NETWORK_ERROR',
  message: 'Network Error',
  isNetworkError: true,
};

beforeEach(() => {
  jest.resetAllMocks();
});

afterEach(() => {
  onlineManager.setOnline(true);
});

// Paused offline, the wizard's Finish would spin until the network came
// back, and a delete would happen whenever it did.
it('fails fast while offline instead of pausing', async () => {
  onlineManager.setOnline(false);
  api.enroll.mockRejectedValueOnce(unreachable);
  api.delete.mockRejectedValueOnce(unreachable);

  const { result } = await renderHook(
    () => ({
      enroll: useEnrollDeviceMutation(),
      remove: useDeleteDeviceMutation(),
    }),
    { wrapper: createQueryWrapper() },
  );

  await act(async () => {
    await expect(result.current.enroll.mutateAsync(enrollBody)).rejects.toBe(
      unreachable,
    );
    await expect(result.current.remove.mutateAsync(device.id)).rejects.toBe(
      unreachable,
    );
  });
});

describe('useEnrollDeviceMutation', () => {
  it('enrolls with the request body and exposes the new device', async () => {
    api.enroll.mockResolvedValueOnce(device);

    const { result } = await renderHook(() => useEnrollDeviceMutation(), {
      wrapper: createQueryWrapper(),
    });
    result.current.mutate(enrollBody);

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(api.enroll).toHaveBeenCalledWith(enrollBody);
    expect(result.current.data).toBe(device);
  });

  it('marks the cached device lists stale, which now miss it', async () => {
    api.enroll.mockResolvedValueOnce(device);
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(deviceKeys.lists(), []);

    const { result } = await renderHook(() => useEnrollDeviceMutation(), {
      wrapper: createQueryWrapper(queryClient),
    });
    await act(async () => {
      await result.current.mutateAsync(enrollBody);
    });

    expect(queryClient.getQueryState(deviceKeys.lists())?.isInvalidated).toBe(
      true,
    );
    const [mutation] = queryClient.getMutationCache().getAll();
    expect(mutation?.options.mutationKey).toEqual(['devices', 'enroll']);
  });

  it('exposes the ApiError of a rejected enrollment', async () => {
    const apiError: ApiError = {
      status: 409,
      code: 'DEVICE_ALREADY_REGISTERED',
      message: 'Taken',
      isNetworkError: false,
    };
    api.enroll.mockRejectedValueOnce(apiError);

    const { result } = await renderHook(() => useEnrollDeviceMutation(), {
      wrapper: createQueryWrapper(),
    });
    result.current.mutate(enrollBody);

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
    expect(result.current.error).toBe(apiError);
  });
});

describe('useDeleteDeviceMutation', () => {
  it('deletes the device by id', async () => {
    api.delete.mockResolvedValueOnce(undefined);

    const { result } = await renderHook(() => useDeleteDeviceMutation(), {
      wrapper: createQueryWrapper(),
    });
    result.current.mutate(device.id);

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(api.delete).toHaveBeenCalledWith(device.id);
  });

  it('marks the cached device lists stale, so the tile disappears', async () => {
    api.delete.mockResolvedValueOnce(undefined);
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(deviceKeys.lists(), [device]);

    const { result } = await renderHook(() => useDeleteDeviceMutation(), {
      wrapper: createQueryWrapper(queryClient),
    });
    await act(async () => {
      await result.current.mutateAsync(device.id);
    });

    expect(queryClient.getQueryState(deviceKeys.lists())?.isInvalidated).toBe(
      true,
    );
    const [mutation] = queryClient.getMutationCache().getAll();
    expect(mutation?.options.mutationKey).toEqual(['devices', 'delete']);
  });

  // The server deletes the device's remotes with it.
  it('marks the cached remote lists stale too, so its remotes disappear', async () => {
    api.delete.mockResolvedValueOnce(undefined);
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(deviceKeys.lists(), [device]);
    queryClient.setQueryData(remoteKeys.lists(), []);

    const { result } = await renderHook(() => useDeleteDeviceMutation(), {
      wrapper: createQueryWrapper(queryClient),
    });
    await act(async () => {
      await result.current.mutateAsync(device.id);
    });

    expect(queryClient.getQueryState(remoteKeys.lists())?.isInvalidated).toBe(
      true,
    );
  });

  // The server deletes the device's buttons with its remotes.
  it('marks the cached buttons lists stale too', async () => {
    api.delete.mockResolvedValueOnce(undefined);
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(buttonKeys.list('r1'), []);

    const { result } = await renderHook(() => useDeleteDeviceMutation(), {
      wrapper: createQueryWrapper(queryClient),
    });
    await act(async () => {
      await result.current.mutateAsync(device.id);
    });

    expect(
      queryClient.getQueryState(buttonKeys.list('r1'))?.isInvalidated,
    ).toBe(true);
  });

  // A 404 means the device is already gone: the refetch drops its tile.
  it('exposes the ApiError of a rejected delete and refreshes the list', async () => {
    api.delete.mockRejectedValueOnce(notFound);
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(deviceKeys.lists(), [device]);

    const { result } = await renderHook(() => useDeleteDeviceMutation(), {
      wrapper: createQueryWrapper(queryClient),
    });
    result.current.mutate(device.id);

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
    expect(result.current.error).toBe(notFound);
    expect(queryClient.getQueryState(deviceKeys.lists())?.isInvalidated).toBe(
      true,
    );
  });
});
