import {
  deviceListResponseSchema,
  deviceResponseSchema,
  type DeviceResponse,
  type EnrollDeviceRequest,
} from '@airremote/contracts';

import { httpClient, noContentSchema } from '@api/http-client';

import { devicesApi } from './devices.api';

jest.mock('@api/http-client', () => ({
  httpClient: { get: jest.fn(), post: jest.fn(), delete: jest.fn() },
  noContentSchema: { kind: 'no-content' },
}));

const get = jest.mocked(httpClient.get);
const post = jest.mocked(httpClient.post);
const remove = jest.mocked(httpClient.delete);
const device: DeviceResponse = {
  id: '6f1c0d4e-9a43-4c1b-8d4e-2f0a1b2c3d4e',
  macAddress: 'aa:bb:cc:dd:ee:01',
  name: 'Living room',
  online: true,
};

describe('devicesApi', () => {
  beforeEach(() => {
    get.mockReset();
    post.mockReset();
    remove.mockReset();
  });

  it('lists the devices, passing the request options on', async () => {
    get.mockResolvedValueOnce([device]);
    const { signal } = new AbortController();

    await expect(devicesApi.list({ signal })).resolves.toEqual([device]);
    expect(get).toHaveBeenCalledWith('/devices', deviceListResponseSchema, {
      signal,
    });
  });

  it('enrolls a device from the request body', async () => {
    post.mockResolvedValueOnce(device);
    const body: EnrollDeviceRequest = {
      macAddress: 'AA:BB:CC:DD:EE:01',
      pairingCode: '7K4MQ9TX',
      name: 'Living room',
    };

    await expect(devicesApi.enroll(body)).resolves.toBe(device);
    expect(post).toHaveBeenCalledWith('/devices', body, deviceResponseSchema);
  });

  it('deletes a device by id, expecting no content', async () => {
    remove.mockResolvedValueOnce(undefined);

    await expect(devicesApi.delete('a/1')).resolves.toBeUndefined();
    expect(remove).toHaveBeenCalledWith('/devices/a%2F1', noContentSchema);
  });

  it('passes the client rejection through', async () => {
    const apiError = {
      status: 404,
      code: 'NOT_FOUND',
      message: 'Not found',
      isNetworkError: false,
    };
    remove.mockRejectedValueOnce(apiError);

    await expect(devicesApi.delete('missing')).rejects.toBe(apiError);
  });
});
