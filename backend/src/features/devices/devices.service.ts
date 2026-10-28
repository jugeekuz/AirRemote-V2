import type {
  DeviceResponse,
  EnrollDeviceRequest,
  PairingCodeResponse,
} from '@airremote/contracts';
import type { DeviceConnections } from '../../shared/device-connections';
import { AppError } from '../../shared/errors';
import type { AuthorizedDevice } from '../../shared/device-messages';
import {
  generatePairingCode,
  hashPairingCode,
  PAIRING_CODE_TTL_MS,
  parseMacAddress,
} from './devices.helpers';
import type { DevicesRepository } from './devices.repository';

export type DevicesService = {
  /**
   * Decides whether a device may open a connection. `commonName` is the
   * Subject CN of the device's client certificate, which must be its MAC
   * address. Returns null when the device is not allowed; a lookup error is
   * thrown, and the caller treats it as a rejection.
   */
  authorizeConnection(commonName: string): Promise<AuthorizedDevice | null>;
  /** Gives a not-yet-enrolled device a code to show its owner. `commonName` as above. */
  issuePairingCode(commonName: string | null): Promise<PairingCodeResponse>;
  /** Creates the device under the user, if the code was issued to that MAC. */
  enroll(userId: string, input: EnrollDeviceRequest): Promise<DeviceResponse>;
  /** The user's devices, by name ignoring case. */
  list(userId: string): Promise<DeviceResponse[]>;
  /** What the device said it runs, from its `hello`. */
  recordFirmwareVersion(
    deviceId: string,
    firmwareVersion: string,
  ): Promise<void>;
};

const alreadyRegistered = () =>
  new AppError(
    409,
    'DEVICE_ALREADY_REGISTERED',
    'Device is already registered',
  );

export function createDevicesService({
  repository,
  connections,
  pairingCodeSecret,
  now = () => new Date(),
  generateCode = generatePairingCode,
}: {
  repository: DevicesRepository;
  /** Only `isConnected` is used, to report each device's online status. */
  connections: Pick<DeviceConnections, 'isConnected'>;
  pairingCodeSecret: string;
  now?: () => Date;
  generateCode?: () => string;
}): DevicesService {
  return {
    async authorizeConnection(commonName) {
      const macAddress = parseMacAddress(commonName);
      if (!macAddress) return null;
      // Enrollment creates the devices row, so a device is allowed once its
      // owner has enrolled it.
      const device = await repository.findByMacAddress(macAddress);
      return device ? { id: device.id, macAddress } : null;
    },

    async issuePairingCode(commonName) {
      const macAddress =
        commonName === null ? null : parseMacAddress(commonName);
      if (!macAddress) {
        throw new AppError(
          403,
          'INVALID_DEVICE_CERTIFICATE',
          'Client certificate does not identify a device',
        );
      }
      if (await repository.findByMacAddress(macAddress)) {
        throw alreadyRegistered();
      }

      const pairingCode = generateCode();
      const expiresAt = new Date(now().getTime() + PAIRING_CODE_TTL_MS);
      await repository.savePairingCode({
        macAddress,
        codeHash: hashPairingCode(pairingCode, pairingCodeSecret),
        expiresAt,
      });
      return { pairingCode, expiresAt: expiresAt.toISOString() };
    },

    async enroll(userId, { macAddress, pairingCode, name }) {
      const result = await repository.enroll({
        macAddress: macAddress.toLowerCase(),
        codeHash: hashPairingCode(pairingCode, pairingCodeSecret),
        now: now(),
        userId,
        name,
      });
      if (result.status === 'invalid-code') {
        throw new AppError(
          400,
          'INVALID_PAIRING_CODE',
          'Pairing code is invalid or has expired',
        );
      }
      if (result.status === 'already-registered') throw alreadyRegistered();

      const { id, macAddress: enrolledMac, name: enrolledName } = result.device;
      return {
        id,
        macAddress: enrolledMac,
        name: enrolledName,
        online: connections.isConnected(id),
      };
    },

    async list(userId) {
      const found = await repository.listForUser(userId);
      return found.map(({ id, macAddress, name }) => ({
        id,
        macAddress,
        name,
        online: connections.isConnected(id),
      }));
    },

    async recordFirmwareVersion(deviceId, firmwareVersion) {
      await repository.setFirmwareVersion(deviceId, firmwareVersion);
    },
  };
}
