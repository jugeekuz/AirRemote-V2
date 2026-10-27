import type { ApiError } from '@app-types';
import {
  act,
  createQueryWrapper,
  createTestQueryClient,
  renderHook,
  waitFor,
} from '@utils/tests';
import { authApi } from '@api/auth';
import { AUTH_STATUS, authStore } from '@stores/auth';

import { useLogout } from './use-logout';

jest.mock('@api/auth');

const api = jest.mocked(authApi);

beforeEach(() => {
  jest.resetAllMocks();
  authStore.reset();
  authStore.signIn('token-1');
});

async function renderLogout() {
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(['x'], 1);
  const { result } = await renderHook(() => useLogout(), {
    wrapper: createQueryWrapper(queryClient),
  });
  return { queryClient, result };
}

describe('useLogout', () => {
  it('calls the API, signs out and clears the cache', async () => {
    api.logout.mockResolvedValueOnce(undefined);
    const errorSpy = jest.spyOn(console, 'error');
    const { queryClient, result } = await renderLogout();
    expect(result.current.isLoggingOut).toBe(false);

    await act(async () => {
      await result.current.logout();
    });

    expect(api.logout).toHaveBeenCalledTimes(1);
    expect(authStore.getStatus()).toBe(AUTH_STATUS.ANONYMOUS);
    expect(authStore.getAccessToken()).toBeNull();
    expect(queryClient.getQueryData(['x'])).toBeUndefined();
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('signs out locally when the API call fails', async () => {
    const unreachable: ApiError = {
      code: 'NETWORK_ERROR',
      message: 'Network Error',
      isNetworkError: true,
    };
    api.logout.mockRejectedValueOnce(unreachable);
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { queryClient, result } = await renderLogout();

    await act(async () => {
      await expect(result.current.logout()).resolves.toBeUndefined();
    });

    expect(errorSpy).toHaveBeenCalledWith('[useLogout]', unreachable);
    expect(authStore.getStatus()).toBe(AUTH_STATUS.ANONYMOUS);
    expect(authStore.getAccessToken()).toBeNull();
    expect(queryClient.getQueryData(['x'])).toBeUndefined();
    errorSpy.mockRestore();
  });

  it('is logging out while the request is in flight', async () => {
    let resolveLogout: () => void = () => {};
    api.logout.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveLogout = resolve;
      }),
    );
    const { result } = await renderLogout();

    let logout: Promise<void> = Promise.resolve();
    await act(async () => {
      logout = result.current.logout();
    });
    await waitFor(() => {
      expect(result.current.isLoggingOut).toBe(true);
    });

    await act(async () => {
      resolveLogout();
      await logout;
    });
    await waitFor(() => {
      expect(result.current.isLoggingOut).toBe(false);
    });
  });
});
