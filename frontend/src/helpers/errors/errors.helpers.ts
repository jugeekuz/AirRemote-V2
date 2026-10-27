import type { ApiErrorCode } from '@app-types';

import { GENERIC_ERROR_CODES } from './errors.constants';

/** Whether an error's own message is too vague to prefer over a caller's. */
export function isGenericErrorCode(code: ApiErrorCode): boolean {
  return GENERIC_ERROR_CODES.includes(code);
}
