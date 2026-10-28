import { create } from 'zustand';

import { AUTH_STATUS, type AuthStatus } from './auth.constants';

type AuthState = {
  accessToken: string | null;
  status: AuthStatus;
};

const INITIAL_AUTH_STATE: AuthState = {
  accessToken: null,
  status: AUTH_STATUS.HYDRATING,
};

const useAuthStore = create<AuthState>()(() => INITIAL_AUTH_STATE);

/**
 * Owns the access token and whether a session exists. Nothing is persisted:
 * the token lives in memory only, and a new launch restores the session from
 * the refresh cookie (status `hydrating` until that settles).
 */
export const authStore = {
  /** A session was established (login, or a successful refresh at startup). */
  signIn(accessToken: string) {
    useAuthStore.setState({ accessToken, status: AUTH_STATUS.AUTHENTICATED });
  },
  /** A refresh handed out a new token; the status stays as it is. */
  setAccessToken(accessToken: string) {
    useAuthStore.setState({ accessToken });
  },
  /** Clears the token and every user-scoped store. The caller also clears the query cache. */
  signOut() {
    useAuthStore.setState({ accessToken: null, status: AUTH_STATUS.ANONYMOUS });
    // User-scoped stores reset here, e.g. `xStore.reset()`. None exist yet.
  },
  startHydration() {
    useAuthStore.setState({ accessToken: null, status: AUTH_STATUS.HYDRATING });
  },
  /** Restoring the session failed for a reason other than having none (e.g. offline). */
  failHydration() {
    useAuthStore.setState({
      accessToken: null,
      status: AUTH_STATUS.HYDRATION_FAILED,
    });
  },
  reset() {
    useAuthStore.setState(INITIAL_AUTH_STATE);
  },

  getAccessToken: () => useAuthStore.getState().accessToken,
  getStatus: () => useAuthStore.getState().status,

  useStatus: () => useAuthStore((state) => state.status),

  /**
   * Calls `listener` each time a signed-in session ends (sign-out or a
   * session the server refused), not when a launch finds no session.
   * Returns the function that stops listening.
   */
  onSessionEnd(listener: () => void): () => void {
    return useAuthStore.subscribe((state, previous) => {
      if (
        previous.status === AUTH_STATUS.AUTHENTICATED &&
        state.status === AUTH_STATUS.ANONYMOUS
      ) {
        listener();
      }
    });
  },
};
