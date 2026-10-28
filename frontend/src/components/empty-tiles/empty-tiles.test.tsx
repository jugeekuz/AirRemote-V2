import { Dimensions } from 'react-native';

import { fireEvent, renderWithProviders, screen } from '@utils/tests';

import EmptyTiles from './empty-tiles';

describe('EmptyTiles', () => {
  it('shows the title and how to get started', async () => {
    await renderWithProviders(<EmptyTiles text="No devices available" />);

    expect(screen.getByText('No devices available')).toBeOnTheScreen();
    expect(screen.getByText('empty-tiles.hint')).toBeOnTheScreen();
  });

  // V1: a screen-tall area whose lower half is a spacer, so the text sits
  // in the upper middle under the header, not in the screen's centre.
  it('is as tall as the window, with its lower half kept empty', async () => {
    await renderWithProviders(<EmptyTiles text="No devices available" />);

    expect(screen.getByTestId('empty-tiles')).toHaveStyle({
      height: Dimensions.get('window').height,
    });
    expect(screen.getByTestId('empty-tiles-spacer')).toBeOnTheScreen();
  });

  // A list that failed to load: the title says so, and the hint becomes a
  // button that asks again.
  it('offers to try again in place of the hint', async () => {
    const onRetry = jest.fn();
    await renderWithProviders(
      <EmptyTiles text="Couldn't load your devices" onRetry={onRetry} />,
    );

    expect(screen.getByText("Couldn't load your devices")).toBeOnTheScreen();
    expect(screen.queryByText('empty-tiles.hint')).not.toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'try-again' }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
