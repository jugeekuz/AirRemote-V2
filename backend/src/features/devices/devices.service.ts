import type { AuthorizedDevice } from '../../shared/device-messages';
import { parseMacAddress } from './devices.helpers';
import type { DevicesRepository } from './devices.repository';

export type DevicesService = {
  /**
   * Decides whether a device may open a connection. `commonName` is the
   * Subject CN of the device's client certificate, which must be its MAC
   * address. Returns null when the device is not allowed; a lookup error is
   * thrown, and the caller treats it as a rejection.
   */
  authorizeConnection(commonName: string): Promise<AuthorizedDevice | null>;
};

export function createDevicesService({
  repository,
}: {
  repository: DevicesRepository;
}): DevicesService {
  return {
    async authorizeConnection(commonName) {
      const macAddress = parseMacAddress(commonName);
      if (!macAddress) return null;
      // Placeholder until onboarding exists: a device is allowed when a
      // devices row has its MAC address. Onboarding replaces this rule.
      const device = await repository.findByMacAddress(macAddress);
      return device ? { id: device.id, macAddress } : null;
    },
  };
}
