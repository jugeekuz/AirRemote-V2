import { StrictMode } from 'react';
import { onlineManager } from '@tanstack/react-query';

import type { AccessTokenResponse } from '@airremote/contracts';

import type { ApiError } from '@app-types';
import {
  act,
  createQueryWrapper,
  render,
  renderHook,
  waitFor,
} from '@utils/tests';
import { authApi } from '@api/auth';
import { AUTH_STATUS, authStore } from '@stores/auth';

import { useSessionHydration } from './use-session-hydration';

jest.mock('@api/auth');

const api = jest.mocked(authApi);
const token: AccessTokenResponse = {
  accessToken: 'abc',
  tokenType: 'Bearer',
  expiresIn: 600,
};
const signedOut: ApiError = {
  status: 401,
  code: 'INVALID_REFRESH_TOKEN',
  message: 'Invalid refresh token',
  isNetworkError: false,
};
const unreachable: ApiError = {
  code: 'NETWORK_ERROR',
  message: 'Network Error',
  isNetworkError: true,
};

beforeEach(() => {
  jest.resetAllMocks();
  authStore.reset();
});

afterEach(() => {
  onlineManager.setOnline(true);
});

describe('useSessionHydration', () => {
  it('signs in when the refresh succeeds', async () => {
    api.refresh.mockResolvedValueOnce(token);

    await renderHook(() => useSessionHydration(), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(authStore.getStatus()).toBe(AUTH_STATUS.AUTHENTICATED);
    });
    expect(authStore.getAccessToken()).toBe('abc');
    expect(api.refresh).toHaveBeenCalledTimes(1);
  });

  it('signs out when the refresh answers 401', async () => {
    api.refresh.mockRejectedValueOnce(signedOut);

    await renderHook(() => useSessionHydration(), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(authStore.getStatus()).toBe(AUTH_STATUS.ANONYMOUS);
    });
    expect(authStore.getAccessToken()).toBeNull();
  });

  it('shows the failure state when the API is unreachable', async () => {
    api.refresh.mockRejectedValueOnce(unreachable);

    await renderHook(() => useSessionHydration(), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(authStore.getStatus()).toBe(AUTH_STATUS.HYDRATION_FAILED);
    });
  });

  it('shows the failure state when the device is offline', async () => {
    onlineManager.setOnline(false);
    api.refresh.mockRejectedValueOnce(unreachable);

    await renderHook(() => useSessionHydration(), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(authStore.getStatus()).toBe(AUTH_STATUS.HYDRATION_FAILED);
    });
  });

  it('signs in after a retry once the API is back', async () => {
    api.refresh.mockRejectedValueOnce(unreachable).mockResolvedValueOnce(token);

    const { result } = await renderHook(() => useSessionHydration(), {
      wrapper: createQueryWrapper(),
    });
    await waitFor(() => {
      expect(authStore.getStatus()).toBe(AUTH_STATUS.HYDRATION_FAILED);
    });

    await act(async () => {
      result.current.retry();
    });

    await waitFor(() => {
      expect(authStore.getStatus()).toBe(AUTH_STATUS.AUTHENTICATED);
    });
    expect(authStore.getAccessToken()).toBe('abc');
    expect(api.refresh).toHaveBeenCalledTimes(2);
  });

  it('refreshes once under StrictMode', async () => {
    api.refresh.mockResolvedValueOnce(token);
    const QueryWrapper = createQueryWrapper();
    function Root() {
      useSessionHydration();
      return null;
    }

    // React double-runs effects only when <StrictMode> is the element that
    // mounts; inside a `wrapper` component it would not, so render it as the root.
    await render(
      <StrictMode>
        <QueryWrapper>
          <Root />
        </QueryWrapper>
      </StrictMode>,
    );

    await waitFor(() => {
      expect(authStore.getStatus()).toBe(AUTH_STATUS.AUTHENTICATED);
    });
    expect(api.refresh).toHaveBeenCalledTimes(1);
  });

  it('does nothing when not hydrating', async () => {
    authStore.signOut();

    await renderHook(() => useSessionHydration(), {
      wrapper: createQueryWrapper(),
    });

    expect(api.refresh).not.toHaveBeenCalled();
    expect(authStore.getStatus()).toBe(AUTH_STATUS.ANONYMOUS);
  });
});
