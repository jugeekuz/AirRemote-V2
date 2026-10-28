import { Children, isValidElement, type ReactNode } from 'react';
import { useWindowDimensions, View } from 'react-native';

import { getTileGridColumns } from '@utils/layout';

type TileGridProps = {
  /** The tiles, each with a `key`. */
  children: ReactNode;
};

/**
 * V1's tile grid: equal-width columns by window width (2 on phones, up to
 * 10), 8 px apart, 4 px padding (8 px on the right).
 *
 * The tiles share one wrapping row, so a tile that moves to another row
 * (an earlier one was deleted, the window got wider) keeps its state. Each
 * cell is `100 / columns` % of a row that sticks 8 px out on the right, and
 * gives those 8 px back as its own right padding: that is the gap between
 * columns, and the last column's padding sits in the overhang.
 */
export default function TileGrid({ children }: TileGridProps) {
  const { width } = useWindowDimensions();
  const cellWidth = `${100 / getTileGridColumns(width)}%` as const;

  return (
    <View className="w-full p-1 pr-2">
      <View className="-mr-2 flex-row flex-wrap gap-y-2">
        {Children.toArray(children).map((tile, index) => (
          <View
            key={isValidElement(tile) && tile.key !== null ? tile.key : index}
            testID="tile-grid-cell"
            className="pr-2"
            style={{ width: cellWidth }}
          >
            {tile}
          </View>
        ))}
      </View>
    </View>
  );
}
