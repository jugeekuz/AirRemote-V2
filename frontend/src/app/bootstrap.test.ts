import type { AccessTokenResponse } from '@airremote/contracts';

import type { ApiError } from '@app-types';
import { createTestQueryClient } from '@utils/tests';
import { authApi } from '@api/auth';
import { configureHttpClient } from '@api/http-client';
import { AUTH_STATUS, authStore } from '@stores/auth';

import { bootstrap, createSessionHooks } from './bootstrap';

jest.mock('@api/auth');
jest.mock('@api/http-client', () => ({
  ...jest.requireActual<object>('@api/http-client'),
  configureHttpClient: jest.fn(),
}));

const refresh = jest.mocked(authApi.refresh);

const tokenResponse = (accessToken: string): AccessTokenResponse => ({
  accessToken,
  tokenType: 'Bearer',
  expiresIn: 600,
});

function setup() {
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(['devices', 'list'], [{ id: 'd1' }]);
  return { queryClient, hooks: createSessionHooks({ queryClient }) };
}

beforeEach(() => {
  jest.resetAllMocks();
  authStore.reset();
  authStore.signIn('old');
});

describe('createSessionHooks', () => {
  it('reads the access token from the auth store', () => {
    const { hooks } = setup();

    expect(hooks.getAccessToken()).toBe('old');
  });

  it('stores and resolves the refreshed token while signed in', async () => {
    const { hooks } = setup();
    refresh.mockResolvedValueOnce(tokenResponse('new'));

    await expect(hooks.refreshAccessToken()).resolves.toBe('new');
    expect(authStore.getAccessToken()).toBe('new');
    expect(authStore.getStatus()).toBe(AUTH_STATUS.AUTHENTICATED);
  });

  it('drops a token refreshed after sign-out and rejects', async () => {
    const { hooks } = setup();
    let answer: (response: AccessTokenResponse) => void = () => {};
    refresh.mockReturnValueOnce(
      new Promise((resolve) => {
        answer = resolve;
      }),
    );

    const refreshing = hooks.refreshAccessToken();
    authStore.signOut();
    answer(tokenResponse('new'));

    await expect(refreshing).rejects.toThrow('Signed out');
    expect(authStore.getAccessToken()).toBeNull();
    expect(authStore.getStatus()).toBe(AUTH_STATUS.ANONYMOUS);
  });

  it('passes a failed refresh through without signing out', async () => {
    const { hooks } = setup();
    const offline: ApiError = {
      code: 'NETWORK_ERROR',
      message: 'Network Error',
      isNetworkError: true,
    };
    refresh.mockRejectedValueOnce(offline);

    await expect(hooks.refreshAccessToken()).rejects.toBe(offline);
    expect(authStore.getAccessToken()).toBe('old');
    expect(authStore.getStatus()).toBe(AUTH_STATUS.AUTHENTICATED);
  });

  it('signs out and clears the query cache when the session ends', () => {
    const { hooks, queryClient } = setup();

    hooks.onSessionExpired();

    expect(authStore.getAccessToken()).toBeNull();
    expect(authStore.getStatus()).toBe(AUTH_STATUS.ANONYMOUS);
    expect(queryClient.getQueryData(['devices', 'list'])).toBeUndefined();
  });
});

describe('bootstrap', () => {
  it('connects the http client to the session', () => {
    bootstrap();

    expect(configureHttpClient).toHaveBeenCalledTimes(1);
    const [hooks] = jest.mocked(configureHttpClient).mock.calls[0] ?? [];
    expect(hooks?.getAccessToken()).toBe('old');
  });
});
