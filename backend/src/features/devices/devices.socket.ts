import type { DeviceMessageHandlers } from '../../shared/device-messages';

/** Handlers for the messages devices send. Thin, like routes. */
export function createDevicesSocketHandlers(): DeviceMessageHandlers {
  return {
    async error(message, { log }) {
      log.warn({ deviceMessage: message.message }, 'Device reported an error');
    },
  };
}
