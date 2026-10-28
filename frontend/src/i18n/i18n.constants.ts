export const SUPPORTED_LANGUAGE = Object.freeze({
  EN: 'en',
} as const);

export type SupportedLanguage =
  (typeof SUPPORTED_LANGUAGE)[keyof typeof SUPPORTED_LANGUAGE];

export const DEFAULT_LANGUAGE: SupportedLanguage = SUPPORTED_LANGUAGE.EN;
export const DEFAULT_NAMESPACE = 'messages';
