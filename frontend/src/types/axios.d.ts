import 'axios';

declare module 'axios' {
  interface AxiosRequestConfig {
    /** Send the request without the Authorization header (public endpoints such as login). */
    skipAuth?: boolean;
  }
}
