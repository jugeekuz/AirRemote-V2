import { useMutation } from '@tanstack/react-query';

import type { LoginRequest } from '@airremote/contracts';

import { authApi } from '@api/auth';

import { authKeys } from './auth.queries';

/**
 * These only call the API. Keeping the session (the access token, who is
 * signed in) is the call site's job, so this layer needs no store.
 *
 * They run even while offline (`networkMode: 'always'`): by default TanStack
 * pauses a mutation until the device is back online, so the refresh at launch
 * would never settle (the app would spin instead of offering a retry) and
 * logout would never sign out. Offline they fail fast with `NETWORK_ERROR`.
 */
const AUTH_NETWORK_MODE = 'always';

export function useLoginMutation() {
  return useMutation({
    mutationKey: [...authKeys.all, 'login'],
    networkMode: AUTH_NETWORK_MODE,
    mutationFn: (credentials: LoginRequest) => authApi.login(credentials),
  });
}

/** Restores a session from the refresh cookie; having none is not an error to show. */
export function useRefreshSessionMutation() {
  return useMutation({
    mutationKey: [...authKeys.all, 'refresh'],
    networkMode: AUTH_NETWORK_MODE,
    mutationFn: () => authApi.refresh(),
    meta: { silent: true },
  });
}

/** Signing out locally must not hinge on the server, so a failure is not shown. */
export function useLogoutMutation() {
  return useMutation({
    mutationKey: [...authKeys.all, 'logout'],
    networkMode: AUTH_NETWORK_MODE,
    mutationFn: () => authApi.logout(),
    meta: { silent: true },
  });
}
