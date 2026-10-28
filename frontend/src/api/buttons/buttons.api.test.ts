import {
  buttonListResponseSchema,
  deviceCommandResponseSchema,
  type ButtonResponse,
  type DeviceCommandResponse,
} from '@airremote/contracts';

import { httpClient, noContentSchema } from '@api/http-client';

import { buttonsApi } from './buttons.api';

jest.mock('@api/http-client', () => ({
  httpClient: { get: jest.fn(), post: jest.fn(), delete: jest.fn() },
  noContentSchema: { kind: 'no-content' },
}));

const get = jest.mocked(httpClient.get);
const post = jest.mocked(httpClient.post);
const remove = jest.mocked(httpClient.delete);
const button: ButtonResponse = {
  id: '3c2b1a09-8f7e-4d6c-9b5a-4f3e2d1c0b9a',
  remoteId: '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d',
  name: 'Power',
};
const command: DeviceCommandResponse = {
  id: '0f9e8d7c-6b5a-4f3e-9d2c-1b0a9f8e7d6c',
  kind: 'learn_button',
  status: 'pending',
  createdAt: '2026-10-28T10:00:00.000Z',
  expiresAt: '2026-10-28T10:00:20.000Z',
};

describe('buttonsApi', () => {
  beforeEach(() => {
    get.mockReset();
    post.mockReset();
    remove.mockReset();
  });

  it("lists a remote's buttons, passing the request options on", async () => {
    get.mockResolvedValueOnce([button]);
    const { signal } = new AbortController();

    await expect(buttonsApi.list('r/1', { signal })).resolves.toEqual([button]);
    expect(get).toHaveBeenCalledWith(
      '/remotes/r%2F1/buttons',
      buttonListResponseSchema,
      { signal },
    );
  });

  it('starts learning a button on a remote, answering with the command', async () => {
    post.mockResolvedValueOnce(command);

    await expect(buttonsApi.learn('r/1', { name: 'Power' })).resolves.toBe(
      command,
    );
    expect(post).toHaveBeenCalledWith(
      '/remotes/r%2F1/buttons',
      { name: 'Power' },
      deviceCommandResponseSchema,
    );
  });

  it('presses a button without a body, answering with the command', async () => {
    const press = { ...command, kind: 'send_ir' as const };
    post.mockResolvedValueOnce(press);

    await expect(buttonsApi.press('b/1')).resolves.toBe(press);
    expect(post).toHaveBeenCalledWith(
      '/buttons/b%2F1/press',
      undefined,
      deviceCommandResponseSchema,
    );
  });

  it('deletes a button by id, expecting no content', async () => {
    remove.mockResolvedValueOnce(undefined);

    await expect(buttonsApi.delete('b/1')).resolves.toBeUndefined();
    expect(remove).toHaveBeenCalledWith('/buttons/b%2F1', noContentSchema);
  });

  it('passes the client rejection through', async () => {
    const apiError = {
      status: 409,
      code: 'DEVICE_OFFLINE',
      message: 'Offline',
      isNetworkError: false,
    };
    post.mockRejectedValueOnce(apiError);

    await expect(buttonsApi.press(button.id)).rejects.toBe(apiError);
  });
});
