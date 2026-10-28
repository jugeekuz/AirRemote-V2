import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { logError } from '@utils/logger';
import { useLogoutMutation } from '@queries/auth';
import { authStore } from '@stores/auth';
import { pendingPairingStore } from '@stores/pending-pairing';

/**
 * Clears the refresh cookie on the server, then signs out locally and drops
 * every cached query and any pairing link waiting for a sign-in. The local sign-out happens even when the request fails,
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
      // A pairing link kept for a sign-in is not for whoever signs in next.
      pendingPairingStore.clear();
      queryClient.clear();
    }
  }, [mutateAsync, queryClient]);

  return { logout, isLoggingOut: isPending };
}
