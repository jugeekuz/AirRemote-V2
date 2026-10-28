import type { QueryClient } from '@tanstack/react-query';

import type { DeviceCommandResponse } from '@airremote/contracts';

import type { ApiError } from '@app-types';
import {
  act,
  createQueryWrapper,
  createTestQueryClient,
  renderHook,
} from '@utils/tests';
import { buttonsApi } from '@api/buttons';
import { deviceCommandsApi } from '@api/device-commands';
import { DEVICE_COMMAND_POLL_MS } from '@queries/device-commands';
import { deviceKeys } from '@queries/devices';
import { DEFAULT_STALE_TIME_MS } from '@queries/queries.constants';
import { alert } from '@ui';

import { usePressButton } from './use-press-button';
import { PRESS_SUCCESS_MS } from './use-press-button.constants';

jest.mock('@api/buttons');
jest.mock('@api/device-commands');

const buttons = jest.mocked(buttonsApi);
const commands = jest.mocked(deviceCommandsApi);
const BUTTON_ID = '3c2b1a09-8f7e-4d6c-9b5a-4f3e2d1c0b9a';
const command: DeviceCommandResponse = {
  id: '0f9e8d7c-6b5a-4f3e-9d2c-1b0a9f8e7d6c',
  kind: 'send_ir',
  status: 'pending',
  createdAt: '2026-10-28T10:00:00.000Z',
  expiresAt: '2026-10-28T10:00:05.000Z',
};
const second: DeviceCommandResponse = {
  ...command,
  id: '1e0f9a8b-7c6d-4e5f-8a3b-2c1d0e9f8a7b',
};

let queryClient: QueryClient;
let alertError: jest.SpyInstance;

// An answer reaches the hook a millisecond or so after it arrives (TanStack
// Query and React schedule the render on timers).
const RENDER_MS = 5;

/** Lets `ms` pass, then the renders the answers it let in set off. */
async function wait(ms: number) {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms + RENDER_MS);
  });
}

/** Taps the control, and lets the press's answer arrive. */
async function tap(press: () => void) {
  await act(async () => {
    press();
  });
  await wait(0);
}

async function renderPress() {
  return renderHook(() => usePressButton(BUTTON_ID), {
    wrapper: createQueryWrapper(queryClient),
  });
}

beforeEach(() => {
  jest.resetAllMocks();
  jest.useFakeTimers();
  queryClient = createTestQueryClient();
  // As the app's client: the command the press answered with is fresh, so
  // the first poll comes after the interval, not on mount.
  queryClient.setDefaultOptions({
    queries: {
      retry: false,
      gcTime: Infinity,
      staleTime: DEFAULT_STALE_TIME_MS,
    },
  });
  alertError = jest.spyOn(alert, 'error');
  buttons.press.mockResolvedValueOnce(command).mockResolvedValueOnce(second);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
  queryClient.clear();
});

describe('usePressButton', () => {
  it('starts idle', async () => {
    const { result } = await renderPress();

    expect(result.current.phase).toBe('idle');
  });

  it("is pending until the device sent the code, succeeded for V1's 800 ms, then idle", async () => {
    commands.get.mockResolvedValue({ ...command, status: 'succeeded' });
    const { result } = await renderPress();

    await tap(result.current.press);
    expect(buttons.press).toHaveBeenCalledWith(BUTTON_ID);
    expect(result.current.phase).toBe('pending');

    await wait(DEVICE_COMMAND_POLL_MS);
    expect(result.current.phase).toBe('succeeded');
    await wait(PRESS_SUCCESS_MS - 4 * RENDER_MS);
    expect(result.current.phase).toBe('succeeded');
    await wait(2 * RENDER_MS);

    expect(result.current.phase).toBe('idle');
  });

  // Review focus 2: one command per tap at most while one is pending.
  it('ignores a second tap in the same moment', async () => {
    const { result } = await renderPress();

    await act(async () => {
      result.current.press();
      result.current.press();
    });

    expect(buttons.press).toHaveBeenCalledTimes(1);
  });

  it('ignores taps while the press is pending, and while the tick shows', async () => {
    commands.get
      .mockResolvedValueOnce(command)
      .mockResolvedValue({ ...command, status: 'succeeded' });
    const { result } = await renderPress();
    await tap(result.current.press);
    await tap(result.current.press);
    await wait(DEVICE_COMMAND_POLL_MS);
    expect(result.current.phase).toBe('pending');
    await tap(result.current.press);
    await wait(DEVICE_COMMAND_POLL_MS);
    expect(result.current.phase).toBe('succeeded');
    await tap(result.current.press);

    expect(buttons.press).toHaveBeenCalledTimes(1);
  });

  it('takes the next tap once it is idle again', async () => {
    commands.get.mockResolvedValue({ ...command, status: 'succeeded' });
    const { result } = await renderPress();
    await tap(result.current.press);
    await wait(DEVICE_COMMAND_POLL_MS + PRESS_SUCCESS_MS);

    await tap(result.current.press);

    expect(buttons.press).toHaveBeenCalledTimes(2);
    expect(result.current.phase).toBe('pending');
  });

  it("goes back to idle when the device couldn't send it (the hook shows the error)", async () => {
    commands.get.mockResolvedValue({
      ...command,
      status: 'failed',
      error: { code: 'IR_SEND_FAILED', message: 'Could not send' },
    });
    const { result } = await renderPress();
    await tap(result.current.press);

    await wait(DEVICE_COMMAND_POLL_MS);

    expect(result.current.phase).toBe('idle');
    expect(alertError).toHaveBeenCalledTimes(1);
    expect(alertError).toHaveBeenCalledWith('errors.IR_SEND_FAILED');
    await tap(result.current.press);
    expect(buttons.press).toHaveBeenCalledTimes(2);
  });

  it('goes back to idle when the press is refused up front', async () => {
    const offline: ApiError = {
      status: 409,
      code: 'DEVICE_OFFLINE',
      message: 'Offline',
      isNetworkError: false,
    };
    buttons.press.mockReset();
    buttons.press.mockRejectedValueOnce(offline).mockResolvedValueOnce(command);
    const { result } = await renderPress();

    await tap(result.current.press);

    expect(result.current.phase).toBe('idle');
    await tap(result.current.press);
    expect(buttons.press).toHaveBeenCalledTimes(2);
  });

  it.each(['DEVICE_OFFLINE', 'DEVICE_NOT_RESPONDING'] as const)(
    'asks for the devices again when the press failed with %s',
    async (code) => {
      commands.get.mockResolvedValue({
        ...command,
        status: 'failed',
        error: { code, message: 'Gone' },
      });
      queryClient.setQueryData(deviceKeys.lists(), []);
      const { result } = await renderPress();

      await tap(result.current.press);
      await wait(DEVICE_COMMAND_POLL_MS);

      expect(queryClient.getQueryState(deviceKeys.lists())?.isInvalidated).toBe(
        true,
      );
    },
  );

  it('asks for the devices again when the press is refused as offline', async () => {
    buttons.press.mockReset();
    buttons.press.mockRejectedValueOnce({
      status: 409,
      code: 'DEVICE_OFFLINE',
      message: 'Offline',
      isNetworkError: false,
    } satisfies ApiError);
    queryClient.setQueryData(deviceKeys.lists(), []);
    const { result } = await renderPress();

    await tap(result.current.press);

    expect(queryClient.getQueryState(deviceKeys.lists())?.isInvalidated).toBe(
      true,
    );
  });

  it("leaves the devices alone when the device couldn't send", async () => {
    commands.get.mockResolvedValue({
      ...command,
      status: 'failed',
      error: { code: 'IR_SEND_FAILED', message: 'Could not send' },
    });
    queryClient.setQueryData(deviceKeys.lists(), []);
    const { result } = await renderPress();

    await tap(result.current.press);
    await wait(DEVICE_COMMAND_POLL_MS);

    expect(queryClient.getQueryState(deviceKeys.lists())?.isInvalidated).toBe(
      false,
    );
  });
});
