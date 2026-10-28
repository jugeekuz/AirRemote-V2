import { createRemoteRequestSchema } from '@airremote/contracts';

/** The dialog's steps, in order: the category, the device, the name. */
export const ADD_REMOTE_STEP = Object.freeze({
  TYPE: 'type',
  DEVICE: 'device',
  NAME: 'name',
} as const);

export type AddRemoteStep =
  (typeof ADD_REMOTE_STEP)[keyof typeof ADD_REMOTE_STEP];

/** The longest name the server takes (the contract's `nameSchema`). */
export const REMOTE_NAME_MAX_LENGTH =
  createRemoteRequestSchema.shape.name.maxLength ?? undefined;
