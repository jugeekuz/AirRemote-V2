/**
 * How long past a command's own lifetime the app keeps waiting for it. The
 * server reports a command it never heard back on as `expired`; this only
 * ends the wait when that report never comes (a server stuck answering
 * `pending`).
 */
export const DEVICE_COMMAND_GRACE_MS = 5_000;
