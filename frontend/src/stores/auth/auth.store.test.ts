import { act, renderHook } from '@testing-library/react-native';

import { AUTH_STATUS } from './auth.constants';
import { authStore } from './auth.store';

beforeEach(() => {
  authStore.reset();
});

describe('authStore', () => {
  it('starts hydrating with no token', () => {
    expect(authStore.getStatus()).toBe(AUTH_STATUS.HYDRATING);
    expect(authStore.getAccessToken()).toBeNull();
  });

  it('signIn stores the token and authenticates', () => {
    authStore.signIn('token-1');

    expect(authStore.getAccessToken()).toBe('token-1');
    expect(authStore.getStatus()).toBe(AUTH_STATUS.AUTHENTICATED);
  });

  it('setAccessToken replaces the token and keeps the status', () => {
    authStore.signIn('token-1');
    authStore.setAccessToken('token-2');

    expect(authStore.getAccessToken()).toBe('token-2');
    expect(authStore.getStatus()).toBe(AUTH_STATUS.AUTHENTICATED);
  });

  it('signOut clears the token and becomes anonymous', () => {
    authStore.signIn('token-1');
    authStore.signOut();

    expect(authStore.getAccessToken()).toBeNull();
    expect(authStore.getStatus()).toBe(AUTH_STATUS.ANONYMOUS);
  });

  it('failHydration clears the token and records the failure', () => {
    authStore.signIn('token-1');
    authStore.failHydration();

    expect(authStore.getAccessToken()).toBeNull();
    expect(authStore.getStatus()).toBe(AUTH_STATUS.HYDRATION_FAILED);
  });

  it('startHydration after a failure goes back to hydrating', () => {
    authStore.failHydration();
    authStore.startHydration();

    expect(authStore.getAccessToken()).toBeNull();
    expect(authStore.getStatus()).toBe(AUTH_STATUS.HYDRATING);
  });

  it('useStatus re-renders when the status changes', async () => {
    const { result } = await renderHook(() => authStore.useStatus());
    expect(result.current).toBe(AUTH_STATUS.HYDRATING);

    await act(async () => {
      authStore.signIn('token-1');
    });
    expect(result.current).toBe(AUTH_STATUS.AUTHENTICATED);

    await act(async () => {
      authStore.signOut();
    });
    expect(result.current).toBe(AUTH_STATUS.ANONYMOUS);
  });
});
