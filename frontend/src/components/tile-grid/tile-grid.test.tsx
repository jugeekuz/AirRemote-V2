import { Dimensions, Text } from 'react-native';

import { act, renderWithProviders, screen } from '@utils/tests';

import TileGrid from './tile-grid';

function setWindowWidth(width: number) {
  const size = { width, height: 844, scale: 2, fontScale: 1 };
  Dimensions.set({ window: size, screen: size });
}

const tiles = (count: number) =>
  Array.from({ length: count }, (_, index) => (
    <Text key={index}>{`tile ${index + 1}`}</Text>
  ));

afterEach(() => {
  setWindowWidth(750);
});

describe('TileGrid', () => {
  it('shows every tile', async () => {
    await renderWithProviders(<TileGrid>{tiles(3)}</TileGrid>);

    expect(screen.getByText('tile 1')).toBeOnTheScreen();
    expect(screen.getByText('tile 3')).toBeOnTheScreen();
  });

  it('puts two tiles in a row on a phone', async () => {
    setWindowWidth(390);
    await renderWithProviders(<TileGrid>{tiles(5)}</TileGrid>);

    expect(screen.getAllByTestId('tile-grid-row')).toHaveLength(3);
  });

  it('puts more tiles in a row on a wider window', async () => {
    await renderWithProviders(<TileGrid>{tiles(5)}</TileGrid>);

    await act(async () => {
      setWindowWidth(640);
    });

    expect(screen.getAllByTestId('tile-grid-row')).toHaveLength(2);
  });

  it('renders nothing without tiles', async () => {
    await renderWithProviders(<TileGrid>{[]}</TileGrid>);

    expect(screen.queryByTestId('tile-grid-row')).not.toBeOnTheScreen();
  });
});
