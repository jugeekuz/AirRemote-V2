import type { ApiErrorCode } from '@app-types';

/**
 * Codes whose own message tells the user nothing specific. A query's
 * `meta.errorMessage` is better than the message of one of these.
 */
export const GENERIC_ERROR_CODES: readonly ApiErrorCode[] = Object.freeze([
  'INTERNAL_ERROR',
  'UNKNOWN_ERROR',
  'BAD_REQUEST',
  'VALIDATION_FAILED',
  'INVALID_RESPONSE',
] as const);

/**
 * Codes that mean the session is missing or over. They only reach a screen
 * when it really ended (a refresh that fails transiently rejects with its
 * own error instead), and the user is taken to Login: nothing to show.
 */
export const SESSION_ERROR_CODES: readonly ApiErrorCode[] = Object.freeze([
  'UNAUTHORIZED',
  'INVALID_REFRESH_TOKEN',
] as const);
