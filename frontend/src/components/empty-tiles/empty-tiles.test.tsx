import { Dimensions } from 'react-native';

import { renderWithProviders, screen } from '@utils/tests';

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
});
