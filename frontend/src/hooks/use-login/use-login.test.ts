import type { AccessTokenResponse } from '@airremote/contracts';

import type { ApiError } from '@app-types';
import { act, createQueryWrapper, renderHook, waitFor } from '@utils/tests';
import { authApi } from '@api/auth';
import { AUTH_STATUS, authStore } from '@stores/auth';

import { useLogin } from './use-login';

jest.mock('@api/auth');

const api = jest.mocked(authApi);
const credentials = { email: 'a@b.co', password: 'secret' };
const token: AccessTokenResponse = {
  accessToken: 'abc',
  tokenType: 'Bearer',
  expiresIn: 600,
};

beforeEach(() => {
  jest.resetAllMocks();
  authStore.reset();
  authStore.signOut();
});

describe('useLogin', () => {
  it('stores the token after logging in', async () => {
    api.login.mockResolvedValueOnce(token);

    const { result } = await renderHook(() => useLogin(), {
      wrapper: createQueryWrapper(),
    });
    expect(result.current.isLoggingIn).toBe(false);

    await act(async () => {
      result.current.login(credentials);
    });

    await waitFor(() => {
      expect(authStore.getStatus()).toBe(AUTH_STATUS.AUTHENTICATED);
    });
    expect(authStore.getAccessToken()).toBe('abc');
    expect(api.login).toHaveBeenCalledWith(credentials);
    expect(result.current.isLoggingIn).toBe(false);
  });

  it('stays signed out when the credentials are wrong', async () => {
    const wrongCredentials: ApiError = {
      status: 401,
      code: 'INVALID_CREDENTIALS',
      message: 'Invalid credentials',
      isNetworkError: false,
    };
    let rejectLogin: (error: ApiError) => void = () => {};
    api.login.mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        rejectLogin = reject;
      }),
    );

    const { result } = await renderHook(() => useLogin(), {
      wrapper: createQueryWrapper(),
    });
    await act(async () => {
      result.current.login({ ...credentials, password: 'wrong' });
    });
    await waitFor(() => {
      expect(result.current.isLoggingIn).toBe(true);
    });

    await act(async () => {
      rejectLogin(wrongCredentials);
    });

    await waitFor(() => {
      expect(result.current.isLoggingIn).toBe(false);
    });
    expect(authStore.getStatus()).toBe(AUTH_STATUS.ANONYMOUS);
    expect(authStore.getAccessToken()).toBeNull();
  });

  it('sends one sign-in for two calls in the same moment', async () => {
    api.login.mockResolvedValue(token);

    const { result } = await renderHook(() => useLogin(), {
      wrapper: createQueryWrapper(),
    });
    await act(async () => {
      result.current.login(credentials);
      result.current.login(credentials);
    });

    await waitFor(() => {
      expect(authStore.getStatus()).toBe(AUTH_STATUS.AUTHENTICATED);
    });
    expect(api.login).toHaveBeenCalledTimes(1);
  });
});
