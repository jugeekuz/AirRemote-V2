import {
  deviceCommandResponseSchema,
  type DeviceCommandResponse,
} from '@airremote/contracts';

import type { RequestOptions } from '@app-types';
import { httpClient } from '@api/http-client';

export const deviceCommandsApi = {
  /**
   * A command sent to a device (learning or pressing a button), as it stands:
   * `pending` until the device answers, then `succeeded`, `failed` or
   * `expired`.
   */
  get(id: string, options?: RequestOptions): Promise<DeviceCommandResponse> {
    return httpClient.get(
      `/device-commands/${encodeURIComponent(id)}`,
      deviceCommandResponseSchema,
      options,
    );
  },
};
