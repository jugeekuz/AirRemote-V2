import { useMemo } from 'react';

import { AUTH_STATUS, authStore, type AuthStatus } from '@stores/auth';

export type UseAuthResult = {
  status: AuthStatus;
  isLoggedIn: boolean;
  /** The session is being restored at launch; show a splash, not Login. */
  isInitializing: boolean;
  /** Restoring the session failed for a reason other than having none (e.g. offline). */
  hasInitializationFailed: boolean;
};

/** The session as the UI needs it. V2 has no current-user endpoint, so it is the status alone. */
export function useAuth(): UseAuthResult {
  const status = authStore.useStatus();

  return useMemo(
    () => ({
      status,
      isLoggedIn: status === AUTH_STATUS.AUTHENTICATED,
      isInitializing: status === AUTH_STATUS.HYDRATING,
      hasInitializationFailed: status === AUTH_STATUS.HYDRATION_FAILED,
    }),
    [status],
  );
}
