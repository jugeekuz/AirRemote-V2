import { useQuery } from '@tanstack/react-query';
import {
  AxiosError,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';

import type { DeviceCommandResponse } from '@airremote/contracts';

import {
  act,
  createQueryWrapper,
  createTestQueryClient,
  renderHook,
  waitFor,
} from '@utils/tests';
import { createHttpClient, httpClient } from '@api/http-client';

import { DEVICE_COMMAND_POLL_MS } from './device-commands.constants';
import {
  deviceCommandKeys,
  deviceCommandQueries,
} from './device-commands.queries';

// The real http client (refresh on 401 included) over a fake network.
const mockAnswer = jest.fn<
  Promise<AxiosResponse>,
  [InternalAxiosRequestConfig]
>();
jest.mock('@api/http-client', () => {
  const actual = jest.requireActual<{
    createHttpClient: typeof createHttpClient;
  }>('@api/http-client');
  return {
    ...actual,
    httpClient: actual.createHttpClient({
      baseURL: 'https://api.test',
      adapter: (config) => mockAnswer(config),
    }),
  };
});

const pending: DeviceCommandResponse = {
  id: '0f9e8d7c-6b5a-4f3e-9d2c-1b0a9f8e7d6c',
  kind: 'send_ir',
  status: 'pending',
  createdAt: '2026-10-28T10:00:00.000Z',
  expiresAt: '2026-10-28T10:00:05.000Z',
};

function respond(
  config: InternalAxiosRequestConfig,
  status: number,
  data: unknown,
): Promise<AxiosResponse> {
  const response: AxiosResponse = {
    status,
    statusText: '',
    headers: {},
    config,
    data,
  };
  if (status >= 400) {
    return Promise.reject(
      new AxiosError(
        `Request failed with status code ${status}`,
        AxiosError.ERR_BAD_REQUEST,
        config,
        {},
        response,
      ),
    );
  }
  return Promise.resolve(response);
}

beforeEach(() => {
  jest.resetAllMocks();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('polling a device command across a session refresh', () => {
  it('refreshes the expired access token and keeps polling', async () => {
    const session = { token: 'old' };
    const hooks = {
      getAccessToken: () => session.token,
      refreshAccessToken: jest.fn(async () => {
        session.token = 'new';
        return 'new';
      }),
      onSessionExpired: jest.fn(),
    };
    httpClient.configure(hooks);
    // The old token has expired; with the new one the device answers on
    // the second poll.
    const answers: DeviceCommandResponse[] = [
      pending,
      { ...pending, status: 'succeeded' },
    ];
    mockAnswer.mockImplementation((config) =>
      config.headers.get('Authorization') === 'Bearer new'
        ? respond(config, 200, answers.shift())
        : respond(config, 401, {
            error: { code: 'UNAUTHORIZED', message: 'Expired' },
          }),
    );
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(deviceCommandKeys.detail(pending.id), pending);
    const { result } = await renderHook(
      () => useQuery(deviceCommandQueries.detail(pending.id)),
      { wrapper: createQueryWrapper(queryClient) },
    );

    await act(async () => {
      jest.advanceTimersByTime(DEVICE_COMMAND_POLL_MS);
    });
    await waitFor(() => {
      expect(hooks.refreshAccessToken).toHaveBeenCalledTimes(1);
    });
    expect(result.current.data?.status).toBe('pending');
    await act(async () => {
      jest.advanceTimersByTime(DEVICE_COMMAND_POLL_MS);
    });

    await waitFor(() => {
      expect(result.current.data?.status).toBe('succeeded');
    });
    expect(result.current.isError).toBe(false);
    expect(hooks.onSessionExpired).not.toHaveBeenCalled();
    // The 401, its retry and the second poll.
    expect(mockAnswer).toHaveBeenCalledTimes(3);
  });
});
