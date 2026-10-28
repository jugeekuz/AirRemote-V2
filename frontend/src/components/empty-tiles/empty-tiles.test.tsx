import { renderWithProviders, screen } from '@utils/tests';

import EmptyTiles from './empty-tiles';

describe('EmptyTiles', () => {
  it('shows the title and how to get started', async () => {
    await renderWithProviders(<EmptyTiles text="No devices available" />);

    expect(screen.getByText('No devices available')).toBeOnTheScreen();
    expect(screen.getByText('empty-tiles.hint')).toBeOnTheScreen();
  });
});
