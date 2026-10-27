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
