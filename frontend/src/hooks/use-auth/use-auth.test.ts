import { act, renderHook } from '@utils/tests';
import { AUTH_STATUS, authStore } from '@stores/auth';

import { useAuth } from './use-auth';

beforeEach(() => {
  authStore.reset();
});

describe('useAuth', () => {
  it('is initializing while the session is hydrating', async () => {
    const { result } = await renderHook(() => useAuth());

    expect(result.current).toEqual({
      status: AUTH_STATUS.HYDRATING,
      isLoggedIn: false,
      isInitializing: true,
      hasInitializationFailed: false,
    });
  });

  it('is logged in when authenticated', async () => {
    const { result } = await renderHook(() => useAuth());

    await act(async () => {
      authStore.signIn('token-1');
    });

    expect(result.current).toEqual({
      status: AUTH_STATUS.AUTHENTICATED,
      isLoggedIn: true,
      isInitializing: false,
      hasInitializationFailed: false,
    });
  });

  it('reports a failed initialization', async () => {
    const { result } = await renderHook(() => useAuth());

    await act(async () => {
      authStore.failHydration();
    });

    expect(result.current).toEqual({
      status: AUTH_STATUS.HYDRATION_FAILED,
      isLoggedIn: false,
      isInitializing: false,
      hasInitializationFailed: true,
    });
  });

  it('is neither logged in nor initializing when anonymous', async () => {
    authStore.signOut();

    const { result } = await renderHook(() => useAuth());

    expect(result.current).toEqual({
      status: AUTH_STATUS.ANONYMOUS,
      isLoggedIn: false,
      isInitializing: false,
      hasInitializationFailed: false,
    });
  });
});
