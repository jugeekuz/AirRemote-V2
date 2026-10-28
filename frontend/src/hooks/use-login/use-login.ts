import { useCallback, useRef } from 'react';

import type { LoginRequest } from '@airremote/contracts';

import { useLoginMutation } from '@queries/auth';
import { authStore } from '@stores/auth';

/**
 * Signs in and keeps the access token. A failure (e.g. wrong credentials)
 * leaves the session as it was; the query client shows its Error dialog.
 * One sign-in at a time: a second call while one is in flight does nothing,
 * even in the same moment, before `isLoggingIn` has rendered.
 */
export function useLogin(): {
  login: (credentials: LoginRequest) => void;
  isLoggingIn: boolean;
} {
  const { mutate, isPending } = useLoginMutation();
  const isInFlightRef = useRef(false);

  const login = useCallback(
    (credentials: LoginRequest) => {
      if (isInFlightRef.current) {
        return;
      }
      isInFlightRef.current = true;
      mutate(credentials, {
        onSuccess: ({ accessToken }) => {
          authStore.signIn(accessToken);
        },
        onSettled: () => {
          isInFlightRef.current = false;
        },
      });
    },
    [mutate],
  );

  return { login, isLoggingIn: isPending };
}
