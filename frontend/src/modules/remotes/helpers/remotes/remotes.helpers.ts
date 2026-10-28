import {
  createRemoteRequestSchema,
  type DeviceResponse,
  type RemoteResponse,
} from '@airremote/contracts';

/** The device whose transmitter the remote uses, once the device list has it. */
export function getRemoteDevice(
  remote: Pick<RemoteResponse, 'deviceId'>,
  devices: readonly DeviceResponse[],
): DeviceResponse | undefined {
  return devices.find((device) => device.id === remote.deviceId);
}

/** A name the server takes: 1 to 100 characters once trimmed, any characters. */
export function isValidRemoteName(name: string): boolean {
  return createRemoteRequestSchema.shape.name.safeParse(name).success;
}
