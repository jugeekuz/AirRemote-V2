import '@i18n/config';

import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import {
  focusManager,
  onlineManager,
  type QueryClient,
} from '@tanstack/react-query';

import { isWebPlatform } from '@utils/platform';
import { authApi } from '@api/auth';
import { configureHttpClient, type HttpClientHooks } from '@api/http-client';
import { AUTH_STATUS, authStore } from '@stores/auth';

import { queryClient } from './query-client';

/** Browsers report focus and connectivity to TanStack Query themselves; React Native doesn't. */
function connectQueryRuntimeToReactNative(): void {
  if (isWebPlatform) {
    return;
  }

  onlineManager.setEventListener((setOnline) =>
    NetInfo.addEventListener((state) => {
      setOnline(state.isConnected === true);
    }),
  );

  focusManager.setEventListener((setFocused) => {
    const subscription = AppState.addEventListener('change', (status) => {
      setFocused(status === 'active');
    });
    return () => {
      subscription.remove();
    };
  });
}

/**
 * How the http client reaches the session. A refresh stores the new token
 * for a signed-in session; if the user signed out while it was in flight,
 * the token is dropped (it must not revive the session) and it rejects. A
 * session the server refused signs out and drops every cached query.
 */
export function createSessionHooks({
  queryClient,
}: {
  queryClient: QueryClient;
}): HttpClientHooks {
  return {
    getAccessToken: authStore.getAccessToken,
    refreshAccessToken: async () => {
      const { accessToken } = await authApi.refresh();
      if (authStore.getStatus() !== AUTH_STATUS.AUTHENTICATED) {
        throw new Error(
          'Signed out while the access token was being refreshed.',
        );
      }
      authStore.setAccessToken(accessToken);
      return accessToken;
    },
    onSessionExpired: () => {
      authStore.signOut();
      queryClient.clear();
    },
  };
}

/**
 * Runs once, before the first render. Restoring the session is not part of
 * it: the root navigator's `useSessionHydration` does that.
 */
export function bootstrap(): void {
  configureHttpClient(createSessionHooks({ queryClient }));
  connectQueryRuntimeToReactNative();
}
