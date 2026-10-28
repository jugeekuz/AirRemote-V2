import type { ViewStyle } from 'react-native';
import { getAnimatedStyle } from 'react-native-reanimated';

import { act, fireEvent, renderWithProviders, screen } from '@utils/tests';

import IndeterminateProgress, {
  INDETERMINATE_PROGRESS_MS,
} from './indeterminate-progress';

// TypeScript resolves Reanimated's web typings; Jest runs the native one.
const readAnimatedStyle = getAnimatedStyle as unknown as (component: {
  props: Record<string, unknown>;
}) => ViewStyle;

function indicator() {
  const style = readAnimatedStyle(
    screen.getByTestId('indeterminate-progress-indicator'),
  );
  const [translate, scale] = (style.transform ?? []) as [
    { translateX?: number }?,
    { scaleX?: number }?,
  ];
  return { translateX: translate?.translateX, scaleX: scale?.scaleX };
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('IndeterminateProgress', () => {
  it('is a busy progress bar named by its label', async () => {
    await renderWithProviders(<IndeterminateProgress label="Loading..." />);

    const bar = screen.getByRole('progressbar', { name: 'Loading...' });
    expect(bar).toBeOnTheScreen();
    expect(bar).toBeBusy();
  });

  it("sweeps NextUI's bar across the track, growing as it goes", async () => {
    await renderWithProviders(<IndeterminateProgress label="Loading..." />);
    await act(async () => {
      fireEvent(screen.getByRole('progressbar'), 'layout', {
        nativeEvent: { layout: { x: 0, y: 0, width: 400, height: 4 } },
      });
    });

    await act(async () => {
      jest.advanceTimersByTime(INDETERMINATE_PROGRESS_MS * 0.99);
    });
    const late = indicator();

    // Near its end: almost a full track to the right, at full width.
    expect(late.translateX).toBeGreaterThan(300);
    expect(late.scaleX).toBeGreaterThan(0.9);
  });
});
