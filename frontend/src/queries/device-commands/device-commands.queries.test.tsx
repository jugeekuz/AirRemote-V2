import { onlineManager, useQuery } from '@tanstack/react-query';

import type {
  ButtonResponse,
  DeviceCommandResponse,
} from '@airremote/contracts';

import type { ApiError } from '@app-types';
import {
  act,
  createQueryWrapper,
  createTestQueryClient,
  renderHook,
  waitFor,
} from '@utils/tests';
import { deviceCommandsApi } from '@api/device-commands';
import { createQueryClient } from '@queries/query-client';

import { DEVICE_COMMAND_POLL_MS } from './device-commands.constants';
import {
  deviceCommandKeys,
  deviceCommandQueries,
} from './device-commands.queries';

jest.mock('@api/device-commands');

const api = jest.mocked(deviceCommandsApi);
const button: ButtonResponse = {
  id: '3c2b1a09-8f7e-4d6c-9b5a-4f3e2d1c0b9a',
  remoteId: '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d',
  name: 'Power',
};
const pending: DeviceCommandResponse = {
  id: '0f9e8d7c-6b5a-4f3e-9d2c-1b0a9f8e7d6c',
  kind: 'learn_button',
  status: 'pending',
  createdAt: '2026-10-28T10:00:00.000Z',
  expiresAt: '2026-10-28T10:00:20.000Z',
};
const notFound: ApiError = {
  status: 404,
  code: 'NOT_FOUND',
  message: 'Not found',
  isNetworkError: false,
};

/** Lets the poll's timer fire `times` times. */
async function advancePolls(times = 1) {
  await act(async () => {
    jest.advanceTimersByTime(DEVICE_COMMAND_POLL_MS * times);
  });
}

beforeEach(() => {
  jest.resetAllMocks();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
  onlineManager.setOnline(true);
});

describe('deviceCommandKeys', () => {
  it('nests every key under the domain', () => {
    expect(deviceCommandKeys.all).toEqual(['device-commands']);
    expect(deviceCommandKeys.detail('c1')).toEqual([
      'device-commands',
      'detail',
      'c1',
    ]);
  });
});

describe('deviceCommandQueries.detail', () => {
  it('loads the command, passing the cancellation signal on', async () => {
    api.get.mockResolvedValueOnce({ ...pending, status: 'succeeded', button });

    const { result } = await renderHook(
      () => useQuery(deviceCommandQueries.detail(pending.id)),
      { wrapper: createQueryWrapper() },
    );

    await waitFor(() => {
      expect(result.current.data?.status).toBe('succeeded');
    });
    expect(api.get).toHaveBeenCalledWith(pending.id, {
      signal: expect.any(AbortSignal),
    });
  });

  it('polls until the device settles the command, then stops', async () => {
    api.get
      .mockResolvedValueOnce(pending)
      .mockResolvedValueOnce({ ...pending, status: 'succeeded', button });
    const { result } = await renderHook(
      () => useQuery(deviceCommandQueries.detail(pending.id)),
      { wrapper: createQueryWrapper() },
    );
    await waitFor(() => {
      expect(result.current.data?.status).toBe('pending');
    });

    await advancePolls();

    await waitFor(() => {
      expect(result.current.data?.status).toBe('succeeded');
    });
    await advancePolls(3);
    expect(api.get).toHaveBeenCalledTimes(2);
  });

  it.each(['failed', 'expired'] as const)(
    'stops polling once the command has %s',
    async (status) => {
      const queryClient = createTestQueryClient();
      queryClient.setQueryData(deviceCommandKeys.detail(pending.id), pending);
      api.get.mockResolvedValue({
        ...pending,
        status,
        error: { code: 'DEVICE_NOT_RESPONDING', message: 'Gone' },
      });
      const { result } = await renderHook(
        () => useQuery(deviceCommandQueries.detail(pending.id)),
        { wrapper: createQueryWrapper(queryClient) },
      );

      await advancePolls();
      await waitFor(() => {
        expect(result.current.data?.status).toBe(status);
      });
      await advancePolls(3);

      expect(api.get).toHaveBeenCalledTimes(1);
    },
  );

  it('stops polling once a poll has failed for good', async () => {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(deviceCommandKeys.detail(pending.id), pending);
    api.get.mockRejectedValue(notFound);
    const { result } = await renderHook(
      () => useQuery(deviceCommandQueries.detail(pending.id)),
      { wrapper: createQueryWrapper(queryClient) },
    );

    await advancePolls();
    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
    await advancePolls(3);

    expect(api.get).toHaveBeenCalledTimes(1);
    expect(result.current.error).toBe(notFound);
  });

  it("keeps its failures out of the app's Error dialog", async () => {
    const onApiError = jest.fn();
    const queryClient = createQueryClient(onApiError);
    queryClient.setDefaultOptions({
      queries: { retry: false, gcTime: Infinity },
    });
    api.get.mockRejectedValue(notFound);
    const { result } = await renderHook(
      () => useQuery(deviceCommandQueries.detail(pending.id)),
      { wrapper: createQueryWrapper(queryClient) },
    );

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(onApiError).not.toHaveBeenCalled();
  });

  // Paused offline, the poll would never answer, so the wait for the
  // command could not end until the network came back.
  it('asks even while offline, and fails instead of pausing', async () => {
    onlineManager.setOnline(false);
    const unreachable: ApiError = {
      code: 'NETWORK_ERROR',
      message: 'Network Error',
      isNetworkError: true,
    };
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(deviceCommandKeys.detail(pending.id), pending);
    api.get.mockRejectedValue(unreachable);
    const { result } = await renderHook(
      () => useQuery(deviceCommandQueries.detail(pending.id)),
      { wrapper: createQueryWrapper(queryClient) },
    );

    await advancePolls();

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
    expect(result.current.fetchStatus).toBe('idle');
    expect(result.current.error).toBe(unreachable);
  });
});
