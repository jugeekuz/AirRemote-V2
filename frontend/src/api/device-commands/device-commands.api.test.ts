import {
  deviceCommandResponseSchema,
  type DeviceCommandResponse,
} from '@airremote/contracts';

import { httpClient } from '@api/http-client';

import { deviceCommandsApi } from './device-commands.api';

jest.mock('@api/http-client', () => ({
  httpClient: { get: jest.fn() },
}));

const get = jest.mocked(httpClient.get);
const command: DeviceCommandResponse = {
  id: '0f9e8d7c-6b5a-4f3e-9d2c-1b0a9f8e7d6c',
  kind: 'send_ir',
  status: 'succeeded',
  createdAt: '2026-10-28T10:00:00.000Z',
  expiresAt: '2026-10-28T10:00:05.000Z',
};

describe('deviceCommandsApi', () => {
  beforeEach(() => {
    get.mockReset();
  });

  it('reads a command by id, passing the request options on', async () => {
    get.mockResolvedValueOnce(command);
    const { signal } = new AbortController();

    await expect(deviceCommandsApi.get('c/1', { signal })).resolves.toBe(
      command,
    );
    expect(get).toHaveBeenCalledWith(
      '/device-commands/c%2F1',
      deviceCommandResponseSchema,
      { signal },
    );
  });

  it('passes the client rejection through', async () => {
    const apiError = {
      status: 404,
      code: 'NOT_FOUND',
      message: 'Not found',
      isNetworkError: false,
    };
    get.mockRejectedValueOnce(apiError);

    await expect(deviceCommandsApi.get('missing')).rejects.toBe(apiError);
  });
});
