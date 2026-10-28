import i18next, { type ParseKeys } from 'i18next';

import type { ApiError, ApiErrorCode } from '@app-types';
import { isGenericErrorCode } from '@helpers/errors';
import { toast } from '@ui';

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
 * Codes that mean the session is missing or over. The user is taken to Login
 * instead, and a session that ends would otherwise toast once per query in
 * flight.
 */
const SESSION_ERROR_CODES: readonly ApiErrorCode[] = Object.freeze([
  'UNAUTHORIZED',
  'INVALID_REFRESH_TOKEN',
] as const);

/**
 * The toast for a failed request. The text comes from the error's code; a
 * caller's `fallbackMessage` replaces it only for generic codes, which say
 * nothing specific. The server's `message` is never shown, and a session
 * error (`UNAUTHORIZED`, `INVALID_REFRESH_TOKEN`) shows nothing.
 */
export function notifyApiError(
  error: ApiError,
  fallbackMessage?: string,
): void {
  if (SESSION_ERROR_CODES.includes(error.code)) {
    return;
  }
  const message = isGenericErrorCode(error.code)
    ? (fallbackMessage ?? errorMessage(error.code))
    : errorMessage(error.code);
  toast.error(message);
}
