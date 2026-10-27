import type { DeviceMessageHandlers } from '../../shared/device-messages';
import type { DevicesService } from './devices.service';

/** Handlers for the messages a device sends about itself. Thin, like routes. */
export function createDevicesSocketHandlers({
  service,
}: {
  service: DevicesService;
}): Pick<DeviceMessageHandlers, 'hello'> {
  return {
    async hello({ firmwareVersion }, { device, log }) {
      await service.recordFirmwareVersion(device.id, firmwareVersion);
      log.info({ firmwareVersion }, 'Device said hello');
    },
  };
}
