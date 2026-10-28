import { getTileGridColumns } from './layout.utils';

describe('getTileGridColumns', () => {
  it.each([
    [320, 2],
    [390, 2],
    [479, 2],
    [480, 3],
    [639, 3],
    [640, 4],
    [768, 5],
    [1023, 5],
    [1024, 7],
    [1280, 10],
    [2560, 10],
  ])('gives %i px %i columns, as V1 did', (width, columns) => {
    expect(getTileGridColumns(width)).toBe(columns);
  });
});
