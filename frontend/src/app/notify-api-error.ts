import i18next from 'i18next';

import type { ApiError, ApiErrorCode } from '@app-types';
import { isGenericErrorCode } from '@helpers/errors';
import { toast } from '@ui';

/** Typed against messages.json: a code without an `errors.<CODE>` entry fails to compile. */
type ErrorMessageKey = `errors.${ApiErrorCode}`;

function errorMessage(code: ApiErrorCode): string {
  const key: ErrorMessageKey = `errors.${code}`;
  return i18next.t(key, { ns: 'messages' });
}

/**
 * The toast for a failed request. The text comes from the error's code; a
 * caller's `fallbackMessage` replaces it only for generic codes, which say
 * nothing specific. The server's `message` is never shown.
 */
export function notifyApiError(
  error: ApiError,
  fallbackMessage?: string,
): void {
  const message = isGenericErrorCode(error.code)
    ? (fallbackMessage ?? errorMessage(error.code))
    : errorMessage(error.code);
  toast.error(message);
}
