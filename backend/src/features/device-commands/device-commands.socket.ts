import type { DeviceMessageHandlers } from '../../shared/device-messages';
import type { DeviceCommandsService } from './device-commands.service';

/** Handlers for the messages devices send. Thin, like routes. */
export function createDeviceCommandsSocketHandlers({
  service,
}: {
  service: DeviceCommandsService;
}): Pick<DeviceMessageHandlers, 'readIrResult' | 'sendIrResult' | 'error'> {
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

    async sendIrResult({ commandId }, { device, log }) {
      const settled = await service.settleSendResult(device.id, commandId);
      if (!settled) {
        log.warn(
          { commandId, outcome: 'not-pending' },
          "Device send result for an unknown, late or another device's command",
        );
      } else {
        log.info({ commandId, outcome: 'succeeded' }, 'Device sent an IR code');
      }
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
