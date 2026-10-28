import { useQuery } from '@tanstack/react-query';

import type { RemoteResponse } from '@airremote/contracts';

import type { ApiError } from '@app-types';
import { createQueryWrapper, renderHook, waitFor } from '@utils/tests';
import { remotesApi } from '@api/remotes';

import { remoteKeys, remoteQueries } from './remotes.queries';

jest.mock('@api/remotes');

const api = jest.mocked(remotesApi);
const remote: RemoteResponse = {
  id: '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d',
  deviceId: '6f1c0d4e-9a43-4c1b-8d4e-2f0a1b2c3d4e',
  name: 'Living room AC',
  type: 'air_conditioner',
};

beforeEach(() => {
  jest.resetAllMocks();
});

describe('remoteKeys', () => {
  it('nests every key under the domain', () => {
    expect(remoteKeys.all).toEqual(['remotes']);
    expect(remoteKeys.lists()).toEqual(['remotes', 'list']);
  });
});

describe('remoteQueries.list', () => {
  it('loads the remotes, passing the cancellation signal on', async () => {
    api.list.mockResolvedValueOnce([remote]);

    const { result } = await renderHook(() => useQuery(remoteQueries.list()), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(result.current.data).toEqual([remote]);
    expect(api.list).toHaveBeenCalledWith({ signal: expect.any(AbortSignal) });
  });

  // Remotes change only when the user changes them; the screen refreshes
  // on focus instead.
  it('does not poll', () => {
    expect(remoteQueries.list().refetchInterval).toBeUndefined();
  });

  it('exposes the ApiError of a failed load', async () => {
    const apiError: ApiError = {
      code: 'NETWORK_ERROR',
      message: 'Network Error',
      isNetworkError: true,
    };
    api.list.mockRejectedValueOnce(apiError);

    const { result } = await renderHook(() => useQuery(remoteQueries.list()), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
    expect(result.current.error).toBe(apiError);
  });
});
