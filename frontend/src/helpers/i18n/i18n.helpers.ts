import {
  SUPPORTED_LANGUAGE,
  type SupportedLanguage,
} from '@i18n/i18n.constants';

const SUPPORTED_LANGUAGES: readonly unknown[] =
  Object.values(SUPPORTED_LANGUAGE);

/** Whether a value (e.g. one read back from storage) is a language the app ships. */
export function isSupportedLanguage(
  value: unknown,
): value is SupportedLanguage {
  return SUPPORTED_LANGUAGES.includes(value);
}
