import type { CreateRemoteRequest, RemoteResponse } from '@airremote/contracts';

import type { ApiError } from '@app-types';
import {
  act,
  createQueryWrapper,
  createTestQueryClient,
  renderHook,
  waitFor,
} from '@utils/tests';
import { remotesApi } from '@api/remotes';

import {
  useCreateRemoteMutation,
  useDeleteRemoteMutation,
} from './remotes.mutations';
import { remoteKeys } from './remotes.queries';

jest.mock('@api/remotes');

const api = jest.mocked(remotesApi);
const remote: RemoteResponse = {
  id: '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d',
  deviceId: '6f1c0d4e-9a43-4c1b-8d4e-2f0a1b2c3d4e',
  name: 'Living room AC',
  type: 'air_conditioner',
};
const body: CreateRemoteRequest = {
  name: 'Living room AC',
  type: 'air_conditioner',
};
const nameTaken: ApiError = {
  status: 409,
  code: 'REMOTE_NAME_TAKEN',
  message: 'Taken',
  isNetworkError: false,
};
const notFound: ApiError = {
  status: 404,
  code: 'NOT_FOUND',
  message: 'Not found',
  isNetworkError: false,
};

beforeEach(() => {
  jest.resetAllMocks();
});

describe('useCreateRemoteMutation', () => {
  it('creates the remote under its device and exposes it', async () => {
    api.create.mockResolvedValueOnce(remote);

    const { result } = await renderHook(() => useCreateRemoteMutation(), {
      wrapper: createQueryWrapper(),
    });
    result.current.mutate({ deviceId: remote.deviceId, body });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(api.create).toHaveBeenCalledWith(remote.deviceId, body);
    expect(result.current.data).toBe(remote);
  });

  it('marks the cached remote lists stale, which now miss it', async () => {
    api.create.mockResolvedValueOnce(remote);
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(remoteKeys.lists(), []);

    const { result } = await renderHook(() => useCreateRemoteMutation(), {
      wrapper: createQueryWrapper(queryClient),
    });
    await act(async () => {
      await result.current.mutateAsync({ deviceId: remote.deviceId, body });
    });

    expect(queryClient.getQueryState(remoteKeys.lists())?.isInvalidated).toBe(
      true,
    );
    const [mutation] = queryClient.getMutationCache().getAll();
    expect(mutation?.options.mutationKey).toEqual(['remotes', 'create']);
  });

  it('exposes the ApiError of a taken name and refreshes the list', async () => {
    api.create.mockRejectedValueOnce(nameTaken);
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(remoteKeys.lists(), []);

    const { result } = await renderHook(() => useCreateRemoteMutation(), {
      wrapper: createQueryWrapper(queryClient),
    });
    result.current.mutate({ deviceId: remote.deviceId, body });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
    expect(result.current.error).toBe(nameTaken);
    expect(queryClient.getQueryState(remoteKeys.lists())?.isInvalidated).toBe(
      true,
    );
  });
});

describe('useDeleteRemoteMutation', () => {
  it('deletes the remote by id', async () => {
    api.delete.mockResolvedValueOnce(undefined);

    const { result } = await renderHook(() => useDeleteRemoteMutation(), {
      wrapper: createQueryWrapper(),
    });
    result.current.mutate(remote.id);

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(api.delete).toHaveBeenCalledWith(remote.id);
  });

  it('marks the cached remote lists stale, so the tile disappears', async () => {
    api.delete.mockResolvedValueOnce(undefined);
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(remoteKeys.lists(), [remote]);

    const { result } = await renderHook(() => useDeleteRemoteMutation(), {
      wrapper: createQueryWrapper(queryClient),
    });
    await act(async () => {
      await result.current.mutateAsync(remote.id);
    });

    expect(queryClient.getQueryState(remoteKeys.lists())?.isInvalidated).toBe(
      true,
    );
    const [mutation] = queryClient.getMutationCache().getAll();
    expect(mutation?.options.mutationKey).toEqual(['remotes', 'delete']);
  });

  // A 404 means the remote is already gone: the refetch drops its tile.
  it('exposes the ApiError of a rejected delete and refreshes the list', async () => {
    api.delete.mockRejectedValueOnce(notFound);
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(remoteKeys.lists(), [remote]);

    const { result } = await renderHook(() => useDeleteRemoteMutation(), {
      wrapper: createQueryWrapper(queryClient),
    });
    result.current.mutate(remote.id);

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
    expect(result.current.error).toBe(notFound);
    expect(queryClient.getQueryState(remoteKeys.lists())?.isInvalidated).toBe(
      true,
    );
  });
});
