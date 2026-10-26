import type { DeviceMessageHandlers } from '../../shared/device-messages';

/** Handlers for the messages devices send. Thin, like routes. */
export function createDevicesSocketHandlers(): DeviceMessageHandlers {
  return {
    // Nothing waits for read results yet; the learning feature will.
    async readIrResult({ requestId, timingsUs }, { log }) {
      log.info(
        { requestId, entries: timingsUs.length },
        'Device read an IR code',
      );
    },

    async error({ code, requestId, message }, { log }) {
      log.warn(
        { code, requestId, deviceMessage: message },
        'Device reported an error',
      );
    },
  };
}
