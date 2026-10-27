import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { logError } from '@utils/logger';
import { useLogoutMutation } from '@queries/auth';
import { authStore } from '@stores/auth';

/**
 * Clears the refresh cookie on the server, then signs out locally and drops
 * every cached query. The local sign-out happens even when the request fails,
 * so `logout()` always resolves.
 */
export function useLogout(): {
  logout: () => Promise<void>;
  isLoggingOut: boolean;
} {
  const queryClient = useQueryClient();
  const { mutateAsync, isPending } = useLogoutMutation();

  const logout = useCallback(async () => {
    try {
      await mutateAsync();
    } catch (error) {
      logError('useLogout', error);
    } finally {
      authStore.signOut();
      queryClient.clear();
    }
  }, [mutateAsync, queryClient]);

  return { logout, isLoggingOut: isPending };
}
