import { useCallback } from 'react';

import type { LoginRequest } from '@airremote/contracts';

import { useLoginMutation } from '@queries/auth';
import { authStore } from '@stores/auth';

/**
 * Signs in and keeps the access token. A failure (e.g. wrong credentials)
 * leaves the session as it was; the query client shows its toast.
 */
export function useLogin(): {
  login: (credentials: LoginRequest) => void;
  isLoggingIn: boolean;
} {
  const { mutate, isPending } = useLoginMutation();

  const login = useCallback(
    (credentials: LoginRequest) => {
      mutate(credentials, {
        onSuccess: ({ accessToken }) => {
          authStore.signIn(accessToken);
        },
      });
    },
    [mutate],
  );

  return { login, isLoggingIn: isPending };
}
