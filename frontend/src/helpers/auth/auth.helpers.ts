import type { ApiError } from '@app-types';

const UNAUTHORIZED_STATUS = 401;

/**
 * Whether the server rejected the session itself. Any 401 counts, whatever its
 * code; network failures, 5xx and malformed responses say nothing about the
 * session.
 */
export function isSignedOutError(error: ApiError): boolean {
  return error.status === UNAUTHORIZED_STATUS;
}
