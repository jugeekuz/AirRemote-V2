import { focusManager, type QueryClient } from '@tanstack/react-query';

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
import {
  DEVICE_COMMAND_POLL_MS,
  deviceCommandKeys,
} from '@queries/device-commands';
import { DEFAULT_STALE_TIME_MS } from '@queries/queries.constants';
import { DEVICE_COMMAND_GRACE_MS } from '@helpers/device-commands';
import { alert } from '@ui';

import { useDeviceCommand } from './use-device-command';

jest.mock('@api/device-commands');

const api = jest.mocked(deviceCommandsApi);
const button: ButtonResponse = {
  id: '3c2b1a09-8f7e-4d6c-9b5a-4f3e2d1c0b9a',
  remoteId: '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d',
  name: 'Power',
};
const pending: DeviceCommandResponse = {
  id: '0f9e8d7c-6b5a-4f3e-9d2c-1b0a9f8e7d6c',
  kind: 'send_ir',
  status: 'pending',
  createdAt: '2026-10-28T10:00:00.000Z',
  expiresAt: '2026-10-28T10:00:05.000Z',
};
const PRESS_LIFETIME_MS = 5_000;

let queryClient: QueryClient;
let alertError: jest.SpyInstance;

/** Lets `ms` pass, with every timer and promise it lets run. */
async function wait(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

/** The hook waiting for `pending` (seeded, as the press mutation does). */
async function renderWaiting(commandId: string | null = pending.id) {
  queryClient.setQueryData(deviceCommandKeys.detail(pending.id), pending);
  return renderHook(({ id }: { id: string | null }) => useDeviceCommand(id), {
    initialProps: { id: commandId },
    wrapper: createQueryWrapper(queryClient),
  });
}

beforeEach(() => {
  jest.resetAllMocks();
  jest.useFakeTimers();
  queryClient = createTestQueryClient();
  alertError = jest.spyOn(alert, 'error');
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
  queryClient.clear();
});

describe('useDeviceCommand', () => {
  it('is idle without a command and asks for nothing', async () => {
    const { result } = await renderWaiting(null);
    await wait(DEVICE_COMMAND_POLL_MS * 3);

    expect(result.current).toEqual({ status: 'idle' });
    expect(api.get).not.toHaveBeenCalled();
  });

  it('is pending until the device answers, then succeeded with the button', async () => {
    api.get
      .mockResolvedValueOnce(pending)
      .mockResolvedValueOnce({ ...pending, status: 'succeeded', button });
    const { result } = await renderWaiting();
    expect(result.current).toEqual({ status: 'pending' });

    await wait(DEVICE_COMMAND_POLL_MS);
    expect(result.current).toEqual({ status: 'pending' });
    await wait(DEVICE_COMMAND_POLL_MS);

    await waitFor(() => {
      expect(result.current).toEqual({ status: 'succeeded', button });
    });
    expect(alertError).not.toHaveBeenCalled();
  });

  it("shows the device's failure in the Error dialog once, however often it renders", async () => {
    api.get.mockResolvedValue({
      ...pending,
      status: 'failed',
      error: { code: 'IR_SEND_FAILED', message: 'Could not send' },
    });
    const { result, rerender } = await renderWaiting();

    await wait(DEVICE_COMMAND_POLL_MS);
    await waitFor(() => {
      expect(result.current).toEqual({
        status: 'failed',
        errorCode: 'IR_SEND_FAILED',
      });
    });
    await rerender({ id: pending.id });
    await rerender({ id: pending.id });
    await wait(DEVICE_COMMAND_POLL_MS * 3);

    expect(alertError).toHaveBeenCalledTimes(1);
    expect(alertError).toHaveBeenCalledWith('errors.IR_SEND_FAILED');
    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it('fails with DEVICE_NOT_RESPONDING once the command expired', async () => {
    api.get.mockResolvedValue({
      ...pending,
      status: 'expired',
      error: { code: 'DEVICE_NOT_RESPONDING', message: 'Gone' },
    });
    const { result } = await renderWaiting();

    await wait(DEVICE_COMMAND_POLL_MS);

    await waitFor(() => {
      expect(result.current).toEqual({
        status: 'failed',
        errorCode: 'DEVICE_NOT_RESPONDING',
      });
    });
    expect(alertError).toHaveBeenCalledWith('errors.DEVICE_NOT_RESPONDING');
  });

  // The device was deleted while its command ran: the command went with it.
  it("fails with the poll's code when the command is gone, and stops asking", async () => {
    const notFound: ApiError = {
      status: 404,
      code: 'NOT_FOUND',
      message: 'Not found',
      isNetworkError: false,
    };
    api.get.mockRejectedValue(notFound);
    const { result } = await renderWaiting();

    await wait(DEVICE_COMMAND_POLL_MS);
    await waitFor(() => {
      expect(result.current).toEqual({
        status: 'failed',
        errorCode: 'NOT_FOUND',
      });
    });
    await wait(DEVICE_COMMAND_POLL_MS * 3);

    expect(api.get).toHaveBeenCalledTimes(1);
    expect(alertError).toHaveBeenCalledTimes(1);
    expect(alertError).toHaveBeenCalledWith('errors.NOT_FOUND');
  });

  it("fails with a network error only after the query's retries", async () => {
    queryClient.setDefaultOptions({
      queries: { retry: 2, retryDelay: 1_000, gcTime: Infinity },
    });
    api.get.mockRejectedValue({
      code: 'NETWORK_ERROR',
      message: 'Network Error',
      isNetworkError: true,
    } satisfies ApiError);
    const { result } = await renderWaiting();

    await wait(DEVICE_COMMAND_POLL_MS);
    await wait(1_000);
    expect(result.current).toEqual({ status: 'pending' });
    await wait(1_000);

    await waitFor(() => {
      expect(result.current).toEqual({
        status: 'failed',
        errorCode: 'NETWORK_ERROR',
      });
    });
    expect(api.get).toHaveBeenCalledTimes(3);
    expect(alertError).toHaveBeenCalledTimes(1);
  });

  // Review focus 1: a command that never settles must not spin forever.
  it('gives up on a command that stays pending past its lifetime', async () => {
    api.get.mockResolvedValue(pending);
    const { result } = await renderWaiting();

    await wait(PRESS_LIFETIME_MS + DEVICE_COMMAND_GRACE_MS - 1);
    expect(result.current).toEqual({ status: 'pending' });
    await wait(1);

    await waitFor(() => {
      expect(result.current).toEqual({
        status: 'failed',
        errorCode: 'DEVICE_NOT_RESPONDING',
      });
    });
    expect(alertError).toHaveBeenCalledWith('errors.DEVICE_NOT_RESPONDING');
    const calls = api.get.mock.calls.length;
    await wait(DEVICE_COMMAND_POLL_MS * 3);
    expect(api.get).toHaveBeenCalledTimes(calls);
  });

  // Polling pauses while the app is in the background; the deadline does
  // not. Coming back late, the command may well have settled meanwhile.
  describe('when the deadline passes in the background', () => {
    beforeEach(() => {
      // As the app's client: the seeded command is fresh, so nothing asks
      // for it on mount.
      queryClient.setDefaultOptions({
        queries: {
          retry: false,
          gcTime: Infinity,
          staleTime: DEFAULT_STALE_TIME_MS,
        },
      });
    });

    afterEach(() => {
      focusManager.setFocused(undefined);
    });

    it('asks once more, and a settled answer wins', async () => {
      api.get.mockResolvedValue({ ...pending, status: 'succeeded', button });
      const { result } = await renderWaiting();
      focusManager.setFocused(false);

      await wait(PRESS_LIFETIME_MS + DEVICE_COMMAND_GRACE_MS);

      await waitFor(() => {
        expect(result.current).toEqual({ status: 'succeeded', button });
      });
      expect(api.get).toHaveBeenCalledTimes(1);
      expect(alertError).not.toHaveBeenCalled();
    });

    it('gives up when that last answer is still pending', async () => {
      api.get.mockResolvedValue(pending);
      const { result } = await renderWaiting();
      focusManager.setFocused(false);

      await wait(PRESS_LIFETIME_MS + DEVICE_COMMAND_GRACE_MS);

      await waitFor(() => {
        expect(result.current).toEqual({
          status: 'failed',
          errorCode: 'DEVICE_NOT_RESPONDING',
        });
      });
      expect(api.get).toHaveBeenCalledTimes(1);
    });
  });

  // Review focus 5: a refused refresh lands on Login; no dialogs pile up.
  it('shows nothing when the session ended', async () => {
    api.get.mockRejectedValue({
      status: 401,
      code: 'UNAUTHORIZED',
      message: 'Signed out',
      isNetworkError: false,
    } satisfies ApiError);
    const { result } = await renderWaiting();

    await wait(DEVICE_COMMAND_POLL_MS);

    await waitFor(() => {
      expect(result.current).toEqual({
        status: 'failed',
        errorCode: 'UNAUTHORIZED',
      });
    });
    expect(alertError).not.toHaveBeenCalled();
  });

  it('reports each failed command once', async () => {
    const second: DeviceCommandResponse = {
      ...pending,
      id: '1e0f9a8b-7c6d-4e5f-8a3b-2c1d0e9f8a7b',
    };
    const failed = (command: DeviceCommandResponse) =>
      ({
        ...command,
        status: 'failed',
        error: { code: 'DEVICE_BUSY', message: 'Busy' },
      }) satisfies DeviceCommandResponse;
    api.get.mockImplementation(async (id) =>
      failed(id === second.id ? second : pending),
    );
    const { result, rerender } = await renderWaiting();
    await wait(DEVICE_COMMAND_POLL_MS);
    await waitFor(() => {
      expect(result.current.status).toBe('failed');
    });

    queryClient.setQueryData(deviceCommandKeys.detail(second.id), second);
    await rerender({ id: second.id });
    expect(result.current).toEqual({ status: 'pending' });
    await wait(DEVICE_COMMAND_POLL_MS);
    await waitFor(() => {
      expect(result.current.status).toBe('failed');
    });

    expect(alertError).toHaveBeenCalledTimes(2);
  });
});
