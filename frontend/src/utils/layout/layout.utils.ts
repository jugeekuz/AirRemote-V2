/**
 * Columns of the tile grid from a minimum window width, widest first: V1's
 * grid (`grid-cols-2 xs:grid-cols-3 sm:grid-cols-4 md:grid-cols-5
 * lg:grid-cols-7 xl:grid-cols-10`). Phones in portrait get 2.
 */
const TILE_GRID_BREAKPOINTS = Object.freeze([
  { minWidth: 1280, columns: 10 },
  { minWidth: 1024, columns: 7 },
  { minWidth: 768, columns: 5 },
  { minWidth: 640, columns: 4 },
  { minWidth: 480, columns: 3 },
] as const);

const TILE_GRID_MIN_COLUMNS = 2;

/** How many tiles fit in a row of the tile grid at this window width. */
export function getTileGridColumns(windowWidth: number): number {
  return (
    TILE_GRID_BREAKPOINTS.find(({ minWidth }) => windowWidth >= minWidth)
      ?.columns ?? TILE_GRID_MIN_COLUMNS
  );
}
