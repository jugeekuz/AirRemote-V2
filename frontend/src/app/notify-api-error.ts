import i18next, { type ParseKeys } from 'i18next';

import type { ApiError, ApiErrorCode } from '@app-types';
import { isGenericErrorCode, isSessionErrorCode } from '@helpers/errors';
import { alert } from '@ui';

/**
 * A key of messages.json. Passing `defaultValue` to `t` makes it accept any
 * string, so the key is checked here instead: a code without an
 * `errors.<CODE>` entry fails to compile.
 */
type MessageKey = ParseKeys<'messages'>;

/** The code's text; the generic text if a translation is missing at runtime. */
function errorMessage(code: ApiErrorCode): string {
  const key: MessageKey = `errors.${code}`;
  return i18next.t(key, {
    ns: 'messages',
    defaultValue: i18next.t('errors.generic', { ns: 'messages' }),
  });
}

/**
 * V1's Error dialog for a failed request (several queue, one at a time).
 * The text comes from the error's code; a caller's `fallbackMessage`
 * replaces it only for generic codes, which say nothing specific. The server's `message` is never shown, and a session
 * error (`UNAUTHORIZED`, `INVALID_REFRESH_TOKEN`) shows nothing.
 */
export function notifyApiError(
  error: ApiError,
  fallbackMessage?: string,
): void {
  // The user is taken to Login; a session that ends would otherwise show
  // an error once per query in flight.
  if (isSessionErrorCode(error.code)) {
    return;
  }
  const message = isGenericErrorCode(error.code)
    ? (fallbackMessage ?? errorMessage(error.code))
    : errorMessage(error.code);
  alert.error(message);
}
