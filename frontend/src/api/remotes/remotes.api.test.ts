import {
  remoteListResponseSchema,
  remoteResponseSchema,
  type CreateRemoteRequest,
  type RemoteResponse,
} from '@airremote/contracts';

import { httpClient, noContentSchema } from '@api/http-client';

import { remotesApi } from './remotes.api';

jest.mock('@api/http-client', () => ({
  httpClient: { get: jest.fn(), post: jest.fn(), delete: jest.fn() },
  noContentSchema: { kind: 'no-content' },
}));

const get = jest.mocked(httpClient.get);
const post = jest.mocked(httpClient.post);
const remove = jest.mocked(httpClient.delete);
const remote: RemoteResponse = {
  id: '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d',
  deviceId: '6f1c0d4e-9a43-4c1b-8d4e-2f0a1b2c3d4e',
  name: 'Living room AC',
  type: 'air_conditioner',
};

describe('remotesApi', () => {
  beforeEach(() => {
    get.mockReset();
    post.mockReset();
    remove.mockReset();
  });

  it('lists every remote of the user, passing the request options on', async () => {
    get.mockResolvedValueOnce([remote]);
    const { signal } = new AbortController();

    await expect(remotesApi.list({ signal })).resolves.toEqual([remote]);
    expect(get).toHaveBeenCalledWith('/remotes', remoteListResponseSchema, {
      signal,
    });
  });

  it('creates a remote under its device', async () => {
    post.mockResolvedValueOnce(remote);
    const body: CreateRemoteRequest = {
      name: 'Living room AC',
      type: 'air_conditioner',
    };

    await expect(remotesApi.create('d/1', body)).resolves.toBe(remote);
    expect(post).toHaveBeenCalledWith(
      '/devices/d%2F1/remotes',
      body,
      remoteResponseSchema,
    );
  });

  it('deletes a remote by id, expecting no content', async () => {
    remove.mockResolvedValueOnce(undefined);

    await expect(remotesApi.delete('r/1')).resolves.toBeUndefined();
    expect(remove).toHaveBeenCalledWith('/remotes/r%2F1', noContentSchema);
  });

  it('passes the client rejection through', async () => {
    const apiError = {
      status: 409,
      code: 'REMOTE_NAME_TAKEN',
      message: 'Taken',
      isNetworkError: false,
    };
    post.mockRejectedValueOnce(apiError);

    await expect(
      remotesApi.create(remote.deviceId, { name: 'AC', type: 'heater' }),
    ).rejects.toBe(apiError);
  });
});
