import { onlineManager } from '@tanstack/react-query';

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
import { buttonsApi } from '@api/buttons';
import { deviceCommandKeys } from '@queries/device-commands';

import {
  useDeleteButtonMutation,
  useLearnButtonMutation,
  usePressButtonMutation,
} from './buttons.mutations';
import { buttonKeys } from './buttons.queries';

jest.mock('@api/buttons');

const api = jest.mocked(buttonsApi);
const remoteId = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
const button: ButtonResponse = {
  id: '3c2b1a09-8f7e-4d6c-9b5a-4f3e2d1c0b9a',
  remoteId,
  name: 'Power',
};
const learnCommand: DeviceCommandResponse = {
  id: '0f9e8d7c-6b5a-4f3e-9d2c-1b0a9f8e7d6c',
  kind: 'learn_button',
  status: 'pending',
  createdAt: '2026-10-28T10:00:00.000Z',
  expiresAt: '2026-10-28T10:00:20.000Z',
};
const pressCommand: DeviceCommandResponse = {
  ...learnCommand,
  id: '1e0f9a8b-7c6d-4e5f-8a3b-2c1d0e9f8a7b',
  kind: 'send_ir',
  expiresAt: '2026-10-28T10:00:05.000Z',
};
const offline: ApiError = {
  status: 409,
  code: 'DEVICE_OFFLINE',
  message: 'Offline',
  isNetworkError: false,
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

// Paused offline, a press or learn would be sent when the network comes
// back (an IR code minutes later) and its control would spin until then.
it('fails fast while offline instead of pausing', async () => {
  onlineManager.setOnline(false);
  api.learn.mockRejectedValueOnce(unreachable);
  api.press.mockRejectedValueOnce(unreachable);
  api.delete.mockRejectedValueOnce(unreachable);

  const { result } = await renderHook(
    () => ({
      learn: useLearnButtonMutation(),
      press: usePressButtonMutation(),
      remove: useDeleteButtonMutation(),
    }),
    { wrapper: createQueryWrapper() },
  );

  await act(async () => {
    await expect(
      result.current.learn.mutateAsync({ remoteId, body: { name: 'Power' } }),
    ).rejects.toBe(unreachable);
    await expect(result.current.press.mutateAsync(button.id)).rejects.toBe(
      unreachable,
    );
    await expect(result.current.remove.mutateAsync(button.id)).rejects.toBe(
      unreachable,
    );
  });
  // Every observer has heard of its failure, none of them paused.
  await waitFor(() => {
    expect(result.current.learn.isError).toBe(true);
    expect(result.current.press.isError).toBe(true);
    expect(result.current.remove.isError).toBe(true);
  });
  expect(result.current.learn.isPaused).toBe(false);
  expect(result.current.press.isPaused).toBe(false);
  expect(result.current.remove.isPaused).toBe(false);
});

describe('useLearnButtonMutation', () => {
  it('starts learning on the remote and seeds the poll with the command', async () => {
    api.learn.mockResolvedValueOnce(learnCommand);
    const queryClient = createTestQueryClient();

    const { result } = await renderHook(() => useLearnButtonMutation(), {
      wrapper: createQueryWrapper(queryClient),
    });
    await act(async () => {
      await result.current.mutateAsync({ remoteId, body: { name: 'Power' } });
    });

    expect(api.learn).toHaveBeenCalledWith(remoteId, { name: 'Power' });
    // The observer hears of the result on a zero-delay timer, which may
    // fire after the act above has ended.
    await waitFor(() => {
      expect(result.current.data).toBe(learnCommand);
    });
    expect(
      queryClient.getQueryData(deviceCommandKeys.detail(learnCommand.id)),
    ).toBe(learnCommand);
    const [mutation] = queryClient.getMutationCache().getAll();
    expect(mutation?.options.mutationKey).toEqual(['buttons', 'learn']);
  });

  it('exposes the ApiError of a refused start and seeds nothing', async () => {
    api.learn.mockRejectedValueOnce(offline);
    const queryClient = createTestQueryClient();

    const { result } = await renderHook(() => useLearnButtonMutation(), {
      wrapper: createQueryWrapper(queryClient),
    });
    result.current.mutate({ remoteId, body: { name: 'Power' } });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
    expect(result.current.error).toBe(offline);
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  });
});

describe('usePressButtonMutation', () => {
  it('presses the button and seeds the poll with the command', async () => {
    api.press.mockResolvedValueOnce(pressCommand);
    const queryClient = createTestQueryClient();

    const { result } = await renderHook(() => usePressButtonMutation(), {
      wrapper: createQueryWrapper(queryClient),
    });
    await act(async () => {
      await result.current.mutateAsync(button.id);
    });

    expect(api.press).toHaveBeenCalledWith(button.id);
    expect(
      queryClient.getQueryData(deviceCommandKeys.detail(pressCommand.id)),
    ).toBe(pressCommand);
    const [mutation] = queryClient.getMutationCache().getAll();
    expect(mutation?.options.mutationKey).toEqual(['buttons', 'press']);
  });

  it('exposes the ApiError of a refused press', async () => {
    api.press.mockRejectedValueOnce(offline);

    const { result } = await renderHook(() => usePressButtonMutation(), {
      wrapper: createQueryWrapper(),
    });
    result.current.mutate(button.id);

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
    expect(result.current.error).toBe(offline);
  });
});

describe('useDeleteButtonMutation', () => {
  it('deletes the button and marks the cached buttons lists stale', async () => {
    api.delete.mockResolvedValueOnce(undefined);
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(buttonKeys.list(remoteId), [button]);

    const { result } = await renderHook(() => useDeleteButtonMutation(), {
      wrapper: createQueryWrapper(queryClient),
    });
    await act(async () => {
      await result.current.mutateAsync(button.id);
    });

    expect(api.delete).toHaveBeenCalledWith(button.id);
    expect(
      queryClient.getQueryState(buttonKeys.list(remoteId))?.isInvalidated,
    ).toBe(true);
    const [mutation] = queryClient.getMutationCache().getAll();
    expect(mutation?.options.mutationKey).toEqual(['buttons', 'delete']);
  });

  // A 404 means the button is already gone: the refetch drops its tile.
  it('exposes the ApiError of a rejected delete and refreshes the list', async () => {
    api.delete.mockRejectedValueOnce(notFound);
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(buttonKeys.list(remoteId), [button]);

    const { result } = await renderHook(() => useDeleteButtonMutation(), {
      wrapper: createQueryWrapper(queryClient),
    });
    result.current.mutate(button.id);

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
    expect(result.current.error).toBe(notFound);
    expect(
      queryClient.getQueryState(buttonKeys.list(remoteId))?.isInvalidated,
    ).toBe(true);
  });
});
