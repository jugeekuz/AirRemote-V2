import {
  accessTokenResponseSchema,
  type AccessTokenResponse,
  type LoginRequest,
} from '@airremote/contracts';

import { httpClient, noContentSchema } from '@api/http-client';

/**
 * The /auth calls carry no access token (they are how one is obtained), and
 * send credentials so the browser keeps and sends the refresh cookie on web;
 * iOS and Android's networking keeps it either way.
 */
const COOKIE_CALL = { skipAuth: true, withCredentials: true } as const;

export const authApi = {
  /** Signs in; the response sets the refresh cookie. */
  login(body: LoginRequest): Promise<AccessTokenResponse> {
    return httpClient.post(
      '/auth/login',
      body,
      accessTokenResponseSchema,
      COOKIE_CALL,
    );
  },

  /** Trades the refresh cookie for a new access token. */
  refresh(): Promise<AccessTokenResponse> {
    return httpClient.post(
      '/auth/refresh',
      undefined,
      accessTokenResponseSchema,
      COOKIE_CALL,
    );
  },

  /** Clears the refresh cookie. */
  logout(): Promise<void> {
    return httpClient.post(
      '/auth/logout',
      undefined,
      noContentSchema,
      COOKIE_CALL,
    );
  },
};
