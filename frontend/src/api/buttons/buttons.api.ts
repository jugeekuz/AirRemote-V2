import {
  buttonListResponseSchema,
  deviceCommandResponseSchema,
  type ButtonResponse,
  type DeviceCommandResponse,
  type LearnButtonRequest,
} from '@airremote/contracts';

import type { RequestOptions } from '@app-types';
import { httpClient, noContentSchema } from '@api/http-client';

export const buttonsApi = {
  /** A remote's buttons, sorted by name. */
  list(remoteId: string, options?: RequestOptions): Promise<ButtonResponse[]> {
    return httpClient.get(
      `/remotes/${encodeURIComponent(remoteId)}/buttons`,
      buttonListResponseSchema,
      options,
    );
  },

  /**
   * Asks the remote's device to read a button from a physical remote. The
   * server answers 202 with the pending command; poll it for the button.
   */
  learn(
    remoteId: string,
    body: LearnButtonRequest,
  ): Promise<DeviceCommandResponse> {
    return httpClient.post(
      `/remotes/${encodeURIComponent(remoteId)}/buttons`,
      body,
      deviceCommandResponseSchema,
    );
  },

  /** Asks the device to send the button's IR code: a pending command (202). */
  press(buttonId: string): Promise<DeviceCommandResponse> {
    return httpClient.post(
      `/buttons/${encodeURIComponent(buttonId)}/press`,
      undefined,
      deviceCommandResponseSchema,
    );
  },

  /** Deletes a button. */
  delete(buttonId: string): Promise<void> {
    return httpClient.delete(
      `/buttons/${encodeURIComponent(buttonId)}`,
      noContentSchema,
    );
  },
};
