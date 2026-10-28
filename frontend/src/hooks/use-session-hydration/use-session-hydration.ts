import { useCallback, useEffect, useRef } from 'react';

import { useRefreshSessionMutation } from '@queries/auth';
import { AUTH_STATUS, authStore } from '@stores/auth';
import { isSignedOutError } from '@helpers/auth';

/**
 * Restores the session from the refresh cookie while the status is
 * `hydrating`: a token signs in, a 401 means there is no session, anything
 * else (offline, 5xx) is a failure the user can `retry()`.
 *
 * Call it once, in the root navigator.
 */
export function useSessionHydration(): { retry: () => void } {
  const status = authStore.useStatus();
  const { mutate: refreshSession } = useRefreshSessionMutation();
  // StrictMode runs effects twice; one hydration makes one refresh call.
  const hasStartedRef = useRef(false);

  useEffect(() => {
    if (status !== AUTH_STATUS.HYDRATING) {
      hasStartedRef.current = false;
      return;
    }
    if (hasStartedRef.current) {
      return;
    }
    hasStartedRef.current = true;
    refreshSession(undefined, {
      onSuccess: ({ accessToken }) => {
        authStore.signIn(accessToken);
      },
      onError: (error) => {
        if (isSignedOutError(error)) {
          authStore.signOut();
        } else {
          authStore.failHydration();
        }
      },
    });
  }, [status, refreshSession]);

  const retry = useCallback(() => {
    hasStartedRef.current = false;
    authStore.startHydration();
  }, []);

  return { retry };
}
