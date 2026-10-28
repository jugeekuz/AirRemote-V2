import type { ViewStyle } from 'react-native';
import type { QueryClient } from '@tanstack/react-query';
import { getAnimatedStyle } from 'react-native-reanimated';

import type { DeviceCommandResponse } from '@airremote/contracts';

import {
  act,
  createTestQueryClient,
  fireEvent,
  renderWithProviders,
  screen,
} from '@utils/tests';
import { buttonsApi } from '@api/buttons';
import { deviceCommandsApi } from '@api/device-commands';
import { DEVICE_COMMAND_POLL_MS } from '@queries/device-commands';
import { DEFAULT_STALE_TIME_MS } from '@queries/queries.constants';
import { PRESS_SUCCESS_MS } from '@modules/remotes/hooks';

import PressButton from './press-button';

jest.mock('@api/buttons');
jest.mock('@api/device-commands');

const buttons = jest.mocked(buttonsApi);
const commands = jest.mocked(deviceCommandsApi);
const BUTTON_ID = '3c2b1a09-8f7e-4d6c-9b5a-4f3e2d1c0b9a';
const PRESS_POWER = 'press-button.label | name: Power';
const command: DeviceCommandResponse = {
  id: '0f9e8d7c-6b5a-4f3e-9d2c-1b0a9f8e7d6c',
  kind: 'send_ir',
  status: 'pending',
  createdAt: '2026-10-28T10:00:00.000Z',
  expiresAt: '2026-10-28T10:00:05.000Z',
};
// An answer reaches the screen a millisecond or so after it arrives.
const RENDER_MS = 5;

// TypeScript resolves Reanimated's web typings; Jest runs the native one.
const readAnimatedStyle = getAnimatedStyle as unknown as (component: {
  props: Record<string, unknown>;
}) => ViewStyle;

function scale(): number {
  const style = readAnimatedStyle(screen.getByTestId('press-button-pop'));
  const transform = (style.transform ?? []) as { scale?: number }[];
  return transform[0]?.scale ?? 1;
}

let queryClient: QueryClient;

async function wait(ms: number) {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms + RENDER_MS);
  });
}

async function tap() {
  await act(async () => {
    fireEvent.press(screen.getByRole('button', { name: PRESS_POWER }));
  });
  await wait(0);
}

async function renderPressButton() {
  await renderWithProviders(
    <PressButton buttonId={BUTTON_ID} buttonName="Power" />,
    { queryClient },
  );
}

beforeEach(() => {
  jest.resetAllMocks();
  jest.useFakeTimers();
  queryClient = createTestQueryClient();
  // As the app's client: the pressed command is fresh, polled after 500 ms.
  queryClient.setDefaultOptions({
    queries: {
      retry: false,
      gcTime: Infinity,
      staleTime: DEFAULT_STALE_TIME_MS,
    },
  });
  buttons.press.mockResolvedValue(command);
});

afterEach(() => {
  jest.useRealTimers();
  queryClient.clear();
});

describe('PressButton', () => {
  it("is V1's green Power circle, named after its button", async () => {
    await renderPressButton();

    const control = screen.getByRole('button', { name: PRESS_POWER });
    expect(control).toBeOnTheScreen();
    expect(control).not.toBeBusy();
    expect(
      screen.getByTestId('press-button-power', { includeHiddenElements: true }),
    ).toBeTruthy();
  });

  it('spins without its ring while the device sends the code', async () => {
    commands.get.mockResolvedValue(command);
    await renderPressButton();

    await tap();

    const control = screen.getByRole('button', { name: PRESS_POWER });
    expect(control).toBeBusy();
    expect(screen.getByTestId('press-button-spinner')).toBeOnTheScreen();
    expect(
      screen.queryByTestId('press-button-power', {
        includeHiddenElements: true,
      }),
    ).not.toBeOnTheScreen();
  });

  // Review focus 2.
  it('sends one press however often it is tapped while pending', async () => {
    commands.get.mockResolvedValue(command);
    await renderPressButton();

    await tap();
    await tap();
    await wait(DEVICE_COMMAND_POLL_MS);
    await tap();

    expect(buttons.press).toHaveBeenCalledTimes(1);
    expect(buttons.press).toHaveBeenCalledWith(BUTTON_ID);
  });

  it("shows V1's tick with its pop, then Power again after 800 ms", async () => {
    commands.get.mockResolvedValue({ ...command, status: 'succeeded' });
    await renderPressButton();
    await tap();

    await wait(DEVICE_COMMAND_POLL_MS);

    expect(
      screen.getByTestId('press-button-tick', { includeHiddenElements: true }),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: PRESS_POWER })).not.toBeBusy();
    // V1's pop: 1 → 1.2 at 30 % of its 0.9 s.
    await wait(270 - RENDER_MS);
    expect(scale()).toBeCloseTo(1.2, 1);
    await wait(PRESS_SUCCESS_MS - 270 - 4 * RENDER_MS);
    expect(
      screen.getByTestId('press-button-tick', { includeHiddenElements: true }),
    ).toBeTruthy();

    await wait(2 * RENDER_MS);

    expect(
      screen.queryByTestId('press-button-tick', {
        includeHiddenElements: true,
      }),
    ).not.toBeOnTheScreen();
    expect(
      screen.getByTestId('press-button-power', { includeHiddenElements: true }),
    ).toBeTruthy();
    expect(scale()).toBe(1);
  });

  it("shows the Error dialog with the failure's text and goes back to Power", async () => {
    commands.get.mockResolvedValue({
      ...command,
      status: 'failed',
      error: { code: 'IR_SEND_FAILED', message: 'Could not send' },
    });
    await renderPressButton();
    await tap();

    await wait(DEVICE_COMMAND_POLL_MS);

    expect(await screen.findByText('errors.IR_SEND_FAILED')).toBeOnTheScreen();
    expect(
      screen.getByTestId('press-button-power', { includeHiddenElements: true }),
    ).toBeTruthy();
  });
});
