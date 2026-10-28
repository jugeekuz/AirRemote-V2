import {
  remoteListResponseSchema,
  remoteResponseSchema,
  type CreateRemoteRequest,
  type RemoteResponse,
} from '@airremote/contracts';

import type { RequestOptions } from '@app-types';
import { httpClient, noContentSchema } from '@api/http-client';

export const remotesApi = {
  /** Every remote of the signed-in user, across their devices. */
  list(options?: RequestOptions): Promise<RemoteResponse[]> {
    return httpClient.get('/remotes', remoteListResponseSchema, options);
  },

  /** Creates a remote on one of the user's devices; names are unique per device. */
  create(deviceId: string, body: CreateRemoteRequest): Promise<RemoteResponse> {
    return httpClient.post(
      `/devices/${encodeURIComponent(deviceId)}/remotes`,
      body,
      remoteResponseSchema,
    );
  },

  /** Deletes a remote with its buttons. */
  delete(remoteId: string): Promise<void> {
    return httpClient.delete(
      `/remotes/${encodeURIComponent(remoteId)}`,
      noContentSchema,
    );
  },
};
