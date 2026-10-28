import { render, screen } from '@testing-library/react-native';

import Tick, { TICK_LENGTH } from './tick';

/** The polyline (rendered as a path), hidden from screen readers. */
function line() {
  return screen.getByTestId('tick-line', { includeHiddenElements: true });
}

describe('Tick', () => {
  it("draws V1's tick: one round-capped polyline in a 130.2 box", async () => {
    await render(
      <Tick size={28} colorClassName="text-green-500" testID="tick" />,
    );

    const svg = screen.getByTestId('tick', { includeHiddenElements: true });
    expect(svg.props).toMatchObject({
      width: 28,
      height: 28,
      vbWidth: 130.2,
      vbHeight: 130.2,
    });
    expect(line().props).toMatchObject({
      d: 'M100.2 40.2 51.5 88.8 29.8 67.5',
      strokeWidth: 9,
      // react-native-svg's code for `round`.
      strokeLinecap: 1,
      strokeDasharray: [TICK_LENGTH, TICK_LENGTH * 2],
    });
  });

  it('is as long as its two arms', () => {
    // 68.8 for the long arm, 30.4 for the short one.
    expect(TICK_LENGTH).toBeCloseTo(99.2, 1);
  });

  it('shows it drawn without a duration', async () => {
    await render(<Tick size={28} colorClassName="text-green-500" />);

    expect(line().props.strokeDashoffset).toBeCloseTo(TICK_LENGTH * 3);
  });

  // Reanimated's Jest mode doesn't pass animated props on to the host, so
  // only the start is checked here; the drawing is checked in the browser.
  it('starts invisible when it is drawn over time', async () => {
    await render(
      <Tick
        size={28}
        colorClassName="text-green-500"
        delayMs={125}
        durationMs={175}
      />,
    );

    expect(line().props.strokeDashoffset).toBeCloseTo(TICK_LENGTH);
  });

  it('is hidden from screen readers (the control around it says what happened)', async () => {
    await render(<Tick size={28} colorClassName="text-green-500" />);

    expect(screen.queryByTestId('tick-line')).not.toBeOnTheScreen();
  });
});
