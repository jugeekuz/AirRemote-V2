/** V1's tick: invisible for this long, then drawn over the next 175 ms. */
export const TICK_DELAY_MS = 125;
export const TICK_DRAW_MS = 175;

/**
 * V1's `animate-pop` (0.9 s: scale 1 → 1.2 at 30 % → 1.1 at 50 % → 1.2 at
 * 65 % → 1), as steps of [scale, duration in ms]. The control turns idle at
 * 800 ms, cutting off its end as V1 did.
 */
export const POP_STEPS: readonly (readonly [number, number])[] = Object.freeze([
  [1.2, 270],
  [1.1, 180],
  [1.2, 135],
  [1, 315],
] as const);
