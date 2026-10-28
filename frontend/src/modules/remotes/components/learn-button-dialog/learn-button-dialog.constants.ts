/** The dialog's steps, in order: the name, V1's instructions, listening. */
export const LEARN_BUTTON_STEP = Object.freeze({
  NAME: 'name',
  INSTRUCTIONS: 'instructions',
  LISTENING: 'listening',
} as const);

export type LearnButtonStep =
  (typeof LEARN_BUTTON_STEP)[keyof typeof LEARN_BUTTON_STEP];

/** The advice's list, as V1's step 2 had it (keys under `learn-button.advice`). */
export const LEARN_BUTTON_ADVICE_STEPS = Object.freeze([
  'set-state',
  'power-off',
  'save-power-on',
] as const);
