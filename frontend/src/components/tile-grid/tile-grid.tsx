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
 */
export default function TileGrid({ children }: TileGridProps) {
  const { width } = useWindowDimensions();
  const columns = getTileGridColumns(width);
  const tiles = Children.toArray(children);

  const rows: ReactNode[][] = [];
  for (let start = 0; start < tiles.length; start += columns) {
    rows.push(tiles.slice(start, start + columns));
  }

  return (
    <View className="w-full gap-2 p-1 pr-2">
      {rows.map((row, rowIndex) => (
        <View key={rowIndex} testID="tile-grid-row" className="flex-row gap-2">
          {row.map((tile, index) => (
            <View
              key={isValidElement(tile) && tile.key !== null ? tile.key : index}
              className="flex-1"
            >
              {tile}
            </View>
          ))}
          {/* Empty cells keep a short last row's tiles as wide as the rest. */}
          {Array.from({ length: columns - row.length }, (_, index) => (
            <View key={`empty-${index}`} className="flex-1" />
          ))}
        </View>
      ))}
    </View>
  );
}
