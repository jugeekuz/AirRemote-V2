import 'axios';

declare module 'axios' {
  interface AxiosRequestConfig {
    /** Send the request without the Authorization header (public endpoints such as login). */
    skipAuth?: boolean;
    /**
     * Set by the http client on the one retry after a token refresh, which
     * already carries the new token and is never refreshed again. Internal:
     * never set it in a call.
     */
    retried?: boolean;
  }
}
