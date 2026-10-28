/** The dialog's steps, in order: how to get a code, the code, the name. */
export const ADD_DEVICE_STEP = Object.freeze({
  INSTRUCTIONS: 'instructions',
  CODE: 'code',
  NAME: 'name',
} as const);

export type AddDeviceStep =
  (typeof ADD_DEVICE_STEP)[keyof typeof ADD_DEVICE_STEP];

/** The longest name the server takes. */
export const DEVICE_NAME_MAX_LENGTH = 100;
