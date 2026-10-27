import { SUPPORTED_LANGUAGE } from '@i18n/i18n.constants';

import { isSupportedLanguage } from './i18n.helpers';

describe('isSupportedLanguage', () => {
  it('is true for every supported language', () => {
    for (const language of Object.values(SUPPORTED_LANGUAGE)) {
      expect(isSupportedLanguage(language)).toBe(true);
    }
  });

  it('is false for a language the app does not ship', () => {
    expect(isSupportedLanguage('fr')).toBe(false);
  });

  it('is false for anything that is not a language code', () => {
    expect(isSupportedLanguage(undefined)).toBe(false);
    expect(isSupportedLanguage(null)).toBe(false);
    expect(isSupportedLanguage(1)).toBe(false);
    expect(isSupportedLanguage({ language: 'en' })).toBe(false);
  });
});
