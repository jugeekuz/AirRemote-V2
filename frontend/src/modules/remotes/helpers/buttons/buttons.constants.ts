import { learnButtonRequestSchema } from '@airremote/contracts';

/** The longest button name the server takes (the contract's `nameSchema`). */
export const BUTTON_NAME_MAX_LENGTH =
  learnButtonRequestSchema.shape.name.maxLength ?? undefined;
