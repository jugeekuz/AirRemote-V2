import { useState } from 'react';
import { Dimensions, Pressable, Text } from 'react-native';

import { act, fireEvent, renderWithProviders, screen } from '@utils/tests';

import TileGrid from './tile-grid';

function setWindowWidth(width: number) {
  const size = { width, height: 844, scale: 2, fontScale: 1 };
  Dimensions.set({ window: size, screen: size });
}

const tiles = (count: number) =>
  Array.from({ length: count }, (_, index) => (
    <Text key={index}>{`tile ${index + 1}`}</Text>
  ));

/** A tile with state of its own, like a button tile mid-press. */
function Counter({ name }: { name: string }) {
  const [presses, setPresses] = useState(0);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={name}
      onPress={() => {
        setPresses((count) => count + 1);
      }}
    >
      <Text>{`${name}: ${presses}`}</Text>
    </Pressable>
  );
}

afterEach(() => {
  setWindowWidth(750);
});

describe('TileGrid', () => {
  it('shows every tile', async () => {
    await renderWithProviders(<TileGrid>{tiles(3)}</TileGrid>);

    expect(screen.getByText('tile 1')).toBeOnTheScreen();
    expect(screen.getByText('tile 3')).toBeOnTheScreen();
  });

  it('gives each tile half the row on a phone', async () => {
    setWindowWidth(390);
    await renderWithProviders(<TileGrid>{tiles(5)}</TileGrid>);

    const cells = screen.getAllByTestId('tile-grid-cell');
    expect(cells).toHaveLength(5);
    for (const cell of cells) {
      expect(cell).toHaveStyle({ width: '50%' });
    }
  });

  it('narrows the tiles on a wider window', async () => {
    await renderWithProviders(<TileGrid>{tiles(5)}</TileGrid>);

    await act(async () => {
      setWindowWidth(640);
    });

    for (const cell of screen.getAllByTestId('tile-grid-cell')) {
      expect(cell).toHaveStyle({ width: '25%' });
    }
  });

  it('renders nothing without tiles', async () => {
    await renderWithProviders(<TileGrid>{[]}</TileGrid>);

    expect(screen.queryByTestId('tile-grid-cell')).not.toBeOnTheScreen();
  });

  // Two columns: removing tile a moves tile c from the second row to the first.
  it('keeps a tile mounted when it moves to another row', async () => {
    setWindowWidth(390);
    const grid = (names: string[]) => (
      <TileGrid>
        {names.map((name) => (
          <Counter key={name} name={name} />
        ))}
      </TileGrid>
    );
    const { rerender } = await renderWithProviders(grid(['a', 'b', 'c']));

    await fireEvent.press(screen.getByRole('button', { name: 'c' }));
    expect(screen.getByText('c: 1')).toBeOnTheScreen();

    await rerender(grid(['b', 'c']));

    expect(screen.getByText('c: 1')).toBeOnTheScreen();
  });
});
