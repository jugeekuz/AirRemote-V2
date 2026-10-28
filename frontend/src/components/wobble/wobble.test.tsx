import { Text, type ViewStyle } from 'react-native';
import { getAnimatedStyle } from 'react-native-reanimated';

import { act, renderWithProviders, screen } from '@utils/tests';

import Wobble, { WOBBLE_MAX_DELAY_MS, WOBBLE_STEP_MS } from './wobble';

// TypeScript resolves Reanimated's web typings, whose `getAnimatedStyle`
// takes nothing; Jest runs the native one, which reads a component's style.
const readAnimatedStyle = getAnimatedStyle as unknown as (component: {
  props: Record<string, unknown>;
}) => ViewStyle;

/** The tile's rotation in degrees. */
function rotation(): number {
  const style = readAnimatedStyle(screen.getByTestId('wobble'));
  const transform = (style.transform ?? []) as { rotate?: string }[];
  return Number.parseFloat(transform[0]?.rotate ?? '0deg');
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('Wobble', () => {
  it('shows its tile', async () => {
    await renderWithProviders(
      <Wobble isActive={false}>
        <Text>Desk ESP32</Text>
      </Wobble>,
    );

    expect(screen.getByText('Desk ESP32')).toBeOnTheScreen();
  });

  it('stays still when not editing', async () => {
    await renderWithProviders(
      <Wobble isActive={false}>
        <Text>Desk ESP32</Text>
      </Wobble>,
    );

    await act(async () => {
      jest.advanceTimersByTime(WOBBLE_MAX_DELAY_MS + WOBBLE_STEP_MS);
    });

    expect(rotation()).toBe(0);
  });

  it('rocks between +1° and −1.5° while editing, after its delay', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0);
    await renderWithProviders(
      <Wobble isActive>
        <Text>Desk ESP32</Text>
      </Wobble>,
    );

    await act(async () => {
      jest.advanceTimersByTime(WOBBLE_STEP_MS);
    });
    expect(rotation()).toBeCloseTo(-1.5, 0);

    await act(async () => {
      jest.advanceTimersByTime(WOBBLE_STEP_MS);
    });
    expect(rotation()).toBeCloseTo(1, 0);
  });

  it('settles back when editing stops', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0);
    const { rerender } = await renderWithProviders(
      <Wobble isActive>
        <Text>Desk ESP32</Text>
      </Wobble>,
    );
    await act(async () => {
      jest.advanceTimersByTime(WOBBLE_STEP_MS);
    });

    await rerender(
      <Wobble isActive={false}>
        <Text>Desk ESP32</Text>
      </Wobble>,
    );
    await act(async () => {
      jest.advanceTimersByTime(WOBBLE_STEP_MS);
    });

    expect(rotation()).toBe(0);
  });
});
