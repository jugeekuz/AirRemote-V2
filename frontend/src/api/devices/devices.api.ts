import {
  deviceListResponseSchema,
  deviceResponseSchema,
  type DeviceResponse,
  type EnrollDeviceRequest,
} from '@airremote/contracts';

import type { RequestOptions } from '@app-types';
import { httpClient, noContentSchema } from '@api/http-client';

export const devicesApi = {
  /** The signed-in user's devices, each with whether it is online now. */
  list(options?: RequestOptions): Promise<DeviceResponse[]> {
    return httpClient.get('/devices', deviceListResponseSchema, options);
  },

  /** Claims a board with the pairing code it showed. */
  enroll(body: EnrollDeviceRequest): Promise<DeviceResponse> {
    return httpClient.post('/devices', body, deviceResponseSchema);
  },

  /** Deletes a device with its remotes and buttons; the board can pair again. */
  delete(deviceId: string): Promise<void> {
    return httpClient.delete(
      `/devices/${encodeURIComponent(deviceId)}`,
      noContentSchema,
    );
  },
};
