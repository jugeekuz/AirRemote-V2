/**
 * How often a pending device command is asked for again. The device reads
 * for up to 15 s and presses settle within 5 s, so twice a second keeps the
 * spinner and the tick close to what the device does.
 */
export const DEVICE_COMMAND_POLL_MS = 500;
