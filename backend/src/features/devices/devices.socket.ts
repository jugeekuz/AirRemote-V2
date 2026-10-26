import type { DeviceMessageHandlers } from '../../shared/device-messages';

/** Handlers for the messages devices send. Thin, like routes. */
export function createDevicesSocketHandlers(): DeviceMessageHandlers {
  return {
    // Nothing waits for read results yet; the learning feature will.
    async readIrResult({ commandId, timingsUs }, { log }) {
      log.info(
        { commandId, entries: timingsUs.length },
        'Device read an IR code',
      );
    },

    async error({ code, commandId, message }, { log }) {
      log.warn(
        { code, commandId, deviceMessage: message },
        'Device reported an error',
      );
    },
  };
}
