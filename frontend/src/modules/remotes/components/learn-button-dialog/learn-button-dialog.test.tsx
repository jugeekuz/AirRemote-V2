import { useState } from 'react';
import { Pressable, Text } from 'react-native';
import type { QueryClient } from '@tanstack/react-query';

import type {
  ButtonResponse,
  DeviceCommandResponse,
} from '@airremote/contracts';

import type { ApiError } from '@app-types';
import {
  act,
  fireEvent,
  mockViewMeasure,
  renderWithProviders,
  screen,
} from '@utils/tests';
import { buttonsApi } from '@api/buttons';
import { deviceCommandsApi } from '@api/device-commands';
import { buttonKeys } from '@queries/buttons';
import { DEVICE_COMMAND_POLL_MS } from '@queries/device-commands';
import { createQueryClient } from '@queries/query-client';
import { DEVICE_COMMAND_GRACE_MS } from '@helpers/device-commands';

import LearnButtonDialog from './learn-button-dialog';

jest.mock('@api/buttons');
jest.mock('@api/device-commands');

const buttons = jest.mocked(buttonsApi);
const commands = jest.mocked(deviceCommandsApi);
const REMOTE_ID = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
const NAME = 'learn-button.name.label';
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
const LEARN_LIFETIME_MS = 20_000;
const RENDER_MS = 5;

let queryClient: QueryClient;
let onApiError: jest.Mock;
let onClose: jest.Mock;

async function wait(ms: number) {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms + RENDER_MS);
  });
}

async function press(name: string) {
  await act(async () => {
    fireEvent.press(screen.getByRole('button', { name }));
  });
}

async function typeName(name: string) {
  await act(async () => {
    fireEvent.changeText(screen.getByLabelText(NAME), name);
  });
}

async function renderDialog() {
  await renderWithProviders(
    <LearnButtonDialog isOpen remoteId={REMOTE_ID} onClose={onClose} />,
    { queryClient },
  );
}

/** From the name to the device listening. */
async function startLearning(name = 'Power') {
  await renderDialog();
  await typeName(name);
  await press('next');
  await press('next');
}

beforeEach(() => {
  jest.resetAllMocks();
  jest.useFakeTimers();
  mockViewMeasure();
  onApiError = jest.fn();
  onClose = jest.fn();
  // The app's client, with the global Error dialog replaced by a mock.
  queryClient = createQueryClient(onApiError);
  queryClient.setDefaultOptions({
    queries: {
      ...queryClient.getDefaultOptions().queries,
      retry: false,
      gcTime: Infinity,
    },
    mutations: { gcTime: Infinity },
  });
  buttons.learn.mockResolvedValue(command);
  commands.get.mockResolvedValue(command);
});

afterEach(() => {
  jest.useRealTimers();
  queryClient.clear();
  jest.restoreAllMocks();
});

describe('LearnButtonDialog', () => {
  it('asks for the name first, with Next only for a valid one', async () => {
    await renderDialog();

    expect(
      screen.getByRole('heading', { name: 'learn-button.title' }),
    ).toBeOnTheScreen();
    expect(screen.getByText('learn-button.name.heading')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'next' })).toBeDisabled();
    expect(screen.getByLabelText(NAME).props.maxLength).toBe(100);

    await typeName('   ');
    expect(screen.getByText('learn-button.name.invalid')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'next' })).toBeDisabled();

    await typeName('Power');
    expect(screen.getByRole('button', { name: 'next' })).toBeEnabled();
  });

  it("shows V1's instructions with the advice for remotes with a screen", async () => {
    await renderDialog();
    await typeName('Power');

    await press('next');

    expect(
      screen.getByText('learn-button.instructions.blink'),
    ).toBeOnTheScreen();
    expect(
      screen.getByText('learn-button.instructions.faster'),
    ).toBeOnTheScreen();
    expect(
      screen.getByText('learn-button.instructions.ready'),
    ).toBeOnTheScreen();
    expect(screen.getByText('learn-button.advice.intro')).toBeOnTheScreen();
    expect(
      screen.getByText('learn-button.advice.save-power-on'),
    ).toBeOnTheScreen();
    expect(buttons.learn).not.toHaveBeenCalled();
  });

  it('goes back to the name, keeping it', async () => {
    await renderDialog();
    await typeName('Power');
    await press('next');

    await press('back');

    expect(screen.getByLabelText(NAME).props.value).toBe('Power');
  });

  it('listens with a progress bar and no buttons once Next starts it', async () => {
    await startLearning('  Power  ');

    expect(buttons.learn).toHaveBeenCalledWith(REMOTE_ID, { name: 'Power' });
    expect(screen.getByText('learn-button.listening')).toBeOnTheScreen();
    expect(
      screen.getByRole('progressbar', { name: 'learn-button.progress' }),
    ).toBeOnTheScreen();
    expect(
      screen.queryByRole('button', { name: 'close' }),
    ).not.toBeOnTheScreen();
    expect(
      screen.queryByRole('button', { name: 'next' }),
    ).not.toBeOnTheScreen();
  });

  it('closes once the device read the button, and the buttons refresh', async () => {
    queryClient.setQueryData(buttonKeys.list(REMOTE_ID), []);
    await startLearning();
    commands.get.mockResolvedValue({
      ...command,
      status: 'succeeded',
      button: power,
    });

    await wait(DEVICE_COMMAND_POLL_MS);

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(
      queryClient.getQueryState(buttonKeys.list(REMOTE_ID))?.isInvalidated,
    ).toBe(true);
    expect(screen.queryByText('errors.', { exact: false })).toBeNull();
  });

  it('shows the Error dialog and closes when no signal came in time', async () => {
    await startLearning();
    commands.get.mockResolvedValue({
      ...command,
      status: 'failed',
      error: { code: 'IR_READ_TIMEOUT', message: 'No IR' },
    });

    await wait(DEVICE_COMMAND_POLL_MS);

    expect(screen.getByText('errors.IR_READ_TIMEOUT')).toBeOnTheScreen();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // Review focus 1: the device was unplugged mid-learn.
  it('gives up, shows the Error dialog and closes when the device never answers', async () => {
    await startLearning();

    await wait(LEARN_LIFETIME_MS + DEVICE_COMMAND_GRACE_MS);

    expect(screen.getByText('errors.DEVICE_NOT_RESPONDING')).toBeOnTheScreen();
    expect(onClose).toHaveBeenCalledTimes(1);
    const polls = commands.get.mock.calls.length;
    await wait(DEVICE_COMMAND_POLL_MS * 4);
    expect(commands.get).toHaveBeenCalledTimes(polls);
  });

  it('closes on a refusal up front, which the app reports once', async () => {
    const offline: ApiError = {
      status: 409,
      code: 'DEVICE_OFFLINE',
      message: 'Offline',
      isNetworkError: false,
    };
    buttons.learn.mockRejectedValueOnce(offline);

    await startLearning();
    await wait(0);

    expect(onApiError).toHaveBeenCalledTimes(1);
    expect(onApiError).toHaveBeenCalledWith(offline, undefined);
    expect(screen.queryByText('errors.DEVICE_OFFLINE')).not.toBeOnTheScreen();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('goes back to the name, keeping it, when the remote already has it', async () => {
    const taken: ApiError = {
      status: 409,
      code: 'BUTTON_NAME_TAKEN',
      message: 'Taken',
      isNetworkError: false,
    };
    buttons.learn.mockRejectedValueOnce(taken);

    await startLearning();
    await wait(0);

    expect(onApiError).toHaveBeenCalledWith(taken, undefined);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByLabelText(NAME).props.value).toBe('Power');
  });

  it('starts over when it is opened again', async () => {
    function Harness() {
      const [isOpen, setIsOpen] = useState(true);
      return (
        <>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setIsOpen(true);
            }}
          >
            <Text>open</Text>
          </Pressable>
          <LearnButtonDialog
            isOpen={isOpen}
            remoteId={REMOTE_ID}
            onClose={() => {
              setIsOpen(false);
            }}
          />
        </>
      );
    }
    await renderWithProviders(<Harness />, { queryClient });
    await typeName('Power');
    await press('next');

    await press('close');
    await wait(1_000);
    await press('open');

    expect(screen.getByText('learn-button.name.heading')).toBeOnTheScreen();
    expect(screen.getByLabelText(NAME).props.value).toBe('');
  });
});
