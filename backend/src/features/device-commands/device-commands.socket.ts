import type { DeviceMessageHandlers } from '../../shared/device-messages';
import type { DeviceCommandsService } from './device-commands.service';

/** Handlers for the messages devices send. Thin, like routes. */
export function createDeviceCommandsSocketHandlers({
  service,
}: {
  service: DeviceCommandsService;
}): DeviceMessageHandlers {
  return {
    async readIrResult({ commandId, timingsUs }, { device, log }) {
      const outcome = await service.settleReadResult(
        device.id,
        commandId,
        timingsUs,
      );
      const fields = { commandId, entries: timingsUs.length, outcome };
      if (outcome === 'not-pending') {
        log.warn(
          fields,
          "Device read result for an unknown, late or another device's command",
        );
      } else {
        log.info(fields, 'Device read an IR code');
      }
    },

    // Task 3 replaces this stub with the real settling.
    async sendIrResult({ commandId }, { log }) {
      log.warn({ commandId }, 'sendIrResult not handled yet');
    },

    async error({ code, commandId, message }, { device, log }) {
      if (commandId === undefined) {
        log.warn({ code, deviceMessage: message }, 'Device reported an error');
        return;
      }
      const settled = await service.settleError(device.id, commandId, code);
      if (!settled) {
        log.warn(
          { code, commandId },
          "Device error for an unknown, late or another device's command",
        );
      }
    },
  };
}
