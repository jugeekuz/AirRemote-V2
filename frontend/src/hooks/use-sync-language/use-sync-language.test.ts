import i18next from 'i18next';

import { act, renderHook } from '@utils/tests';
import { preferencesStore } from '@stores/preferences';
import { DEFAULT_LANGUAGE, type SupportedLanguage } from '@i18n/i18n.constants';

import { useSyncLanguage } from './use-sync-language';

jest.mock('i18next', () => ({
  __esModule: true,
  default: { language: 'en', changeLanguage: jest.fn(), t: jest.fn() },
}));

const i18n = jest.mocked(i18next);

beforeEach(() => {
  jest.clearAllMocks();
  i18n.changeLanguage.mockResolvedValue(i18n.t);
  i18n.language = DEFAULT_LANGUAGE;
  preferencesStore.reset();
});

describe('useSyncLanguage', () => {
  it('leaves i18next alone when it already uses the stored language', async () => {
    await renderHook(() => {
      useSyncLanguage();
    });

    expect(i18n.changeLanguage).not.toHaveBeenCalled();
  });

  it('applies the stored language when i18next uses another one', async () => {
    i18n.language = 'cimode';

    await renderHook(() => {
      useSyncLanguage();
    });

    expect(i18n.changeLanguage).toHaveBeenCalledWith(DEFAULT_LANGUAGE);
  });

  it('changes the language when the preference changes', async () => {
    // Only English ships so far; any other code stands in for a second one.
    const greek = 'el' as SupportedLanguage;
    await renderHook(() => {
      useSyncLanguage();
    });

    await act(async () => {
      preferencesStore.setLanguage(greek);
    });

    expect(i18n.changeLanguage).toHaveBeenCalledTimes(1);
    expect(i18n.changeLanguage).toHaveBeenCalledWith(greek);
  });

  it('logs a failed language change', async () => {
    const error = new Error('no resources');
    i18n.changeLanguage.mockRejectedValueOnce(error);
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    i18n.language = 'cimode';

    await renderHook(() => {
      useSyncLanguage();
    });

    expect(errorSpy).toHaveBeenCalledWith('[useSyncLanguage]', error);
    errorSpy.mockRestore();
  });
});
