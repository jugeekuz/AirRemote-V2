export const AUTH_STATUS = Object.freeze({
  HYDRATING: 'hydrating',
  AUTHENTICATED: 'authenticated',
  ANONYMOUS: 'anonymous',
  HYDRATION_FAILED: 'hydration-failed',
} as const);

export type AuthStatus = (typeof AUTH_STATUS)[keyof typeof AUTH_STATUS];
