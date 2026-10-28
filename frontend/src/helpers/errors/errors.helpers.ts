import type { ApiErrorCode } from '@app-types';

import { GENERIC_ERROR_CODES, SESSION_ERROR_CODES } from './errors.constants';

/** Whether an error's own message is too vague to prefer over a caller's. */
export function isGenericErrorCode(code: ApiErrorCode): boolean {
  return GENERIC_ERROR_CODES.includes(code);
}

/** Whether the error means the session ended (the app shows Login, no dialog). */
export function isSessionErrorCode(code: ApiErrorCode): boolean {
  return SESSION_ERROR_CODES.includes(code);
}
