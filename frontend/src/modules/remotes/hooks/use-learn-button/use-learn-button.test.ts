import type { QueryClient } from '@tanstack/react-query';

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
} from '@utils/tests';
import { buttonsApi } from '@api/buttons';
import { deviceCommandsApi } from '@api/device-commands';
import { buttonKeys } from '@queries/buttons';
import { DEVICE_COMMAND_POLL_MS } from '@queries/device-commands';
import { DEFAULT_STALE_TIME_MS } from '@queries/queries.constants';

import { useLearnButton } from './use-learn-button';

jest.mock('@api/buttons');
jest.mock('@api/device-commands');

const buttons = jest.mocked(buttonsApi);
const commands = jest.mocked(deviceCommandsApi);
const REMOTE_ID = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
const power: ButtonResponse = {
  id: '3c2b1a09-8f7e-4d6c-9b5a-4f3e2d1c0b9a',
  remoteId: REMOTE_ID,
  name: 'Power',
};
const command: DeviceCommandResponse = {
  id: '0f9e8d7c-6b5a-4f3e-9d2c-1b0a9f8e7d6c',
  kind: 'learn_button',
  status: 'pending',
  createdAt: '2026-10-28T10:00:00.000Z',
  expiresAt: '2026-10-28T10:00:20.000Z',
};
const RENDER_MS = 5;

let queryClient: QueryClient;
let onDone: jest.Mock;
let onNameTaken: jest.Mock;

async function wait(ms: number) {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms + RENDER_MS);
  });
}

async function renderLearn() {
  return renderHook(() => useLearnButton(REMOTE_ID, { onDone, onNameTaken }), {
    wrapper: createQueryWrapper(queryClient),
  });
}

beforeEach(() => {
  jest.resetAllMocks();
  jest.useFakeTimers();
  queryClient = createTestQueryClient();
  queryClient.setDefaultOptions({
    queries: {
      retry: false,
      gcTime: Infinity,
      staleTime: DEFAULT_STALE_TIME_MS,
    },
  });
  onDone = jest.fn();
  onNameTaken = jest.fn();
  buttons.learn.mockResolvedValue(command);
});

afterEach(() => {
  jest.useRealTimers();
  queryClient.clear();
});

describe('useLearnButton', () => {
  it('listens from the moment it starts until the device read the button', async () => {
    commands.get
      .mockResolvedValueOnce(command)
      .mockResolvedValue({ ...command, status: 'succeeded', button: power });
    queryClient.setQueryData(buttonKeys.list(REMOTE_ID), []);
    const { result } = await renderLearn();
    expect(result.current.isListening).toBe(false);

    await act(async () => {
      result.current.learn('Power');
    });
    expect(result.current.isListening).toBe(true);
    expect(buttons.learn).toHaveBeenCalledWith(REMOTE_ID, { name: 'Power' });
    await wait(DEVICE_COMMAND_POLL_MS);
    expect(result.current.isListening).toBe(true);
    expect(onDone).not.toHaveBeenCalled();
    await wait(DEVICE_COMMAND_POLL_MS);

    expect(onDone).toHaveBeenCalledTimes(1);
    expect(
      queryClient.getQueryState(buttonKeys.list(REMOTE_ID))?.isInvalidated,
    ).toBe(true);
  });

  it('is done when the device could not read the button', async () => {
    commands.get.mockResolvedValue({
      ...command,
      status: 'failed',
      error: { code: 'IR_READ_TIMEOUT', message: 'No IR' },
    });
    queryClient.setQueryData(buttonKeys.list(REMOTE_ID), []);
    const { result } = await renderLearn();

    await act(async () => {
      result.current.learn('Power');
    });
    await wait(DEVICE_COMMAND_POLL_MS);

    expect(onDone).toHaveBeenCalledTimes(1);
    expect(
      queryClient.getQueryState(buttonKeys.list(REMOTE_ID))?.isInvalidated,
    ).toBe(false);
  });

  it('asks for another name when the remote already has it', async () => {
    buttons.learn.mockRejectedValueOnce({
      status: 409,
      code: 'BUTTON_NAME_TAKEN',
      message: 'Taken',
      isNetworkError: false,
    } satisfies ApiError);
    const { result } = await renderLearn();

    await act(async () => {
      result.current.learn('Power');
    });
    await wait(0);

    expect(onNameTaken).toHaveBeenCalledTimes(1);
    expect(onDone).not.toHaveBeenCalled();
    expect(result.current.isListening).toBe(false);
  });

  it('is done when the learn is refused up front for another reason', async () => {
    buttons.learn.mockRejectedValueOnce({
      status: 409,
      code: 'DEVICE_OFFLINE',
      message: 'Offline',
      isNetworkError: false,
    } satisfies ApiError);
    const { result } = await renderLearn();

    await act(async () => {
      result.current.learn('Power');
    });
    await wait(0);

    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onNameTaken).not.toHaveBeenCalled();
  });
});
