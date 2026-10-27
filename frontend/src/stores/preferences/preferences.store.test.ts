import { act, renderHook } from '@testing-library/react-native';

import { persistStorage } from '@adapters/storage';
import { STORE_PERSIST_KEY } from '@stores/stores.constants';
import { DEFAULT_LANGUAGE, SUPPORTED_LANGUAGE } from '@i18n/i18n.constants';

import { preferencesStore } from './preferences.store';

// The mocked `persistStorage` keeps its Map for the whole file, so each test
// starts from an empty one as well as from the store's initial state.
beforeEach(() => {
  preferencesStore.reset();
  persistStorage.removeItem(STORE_PERSIST_KEY.PREFERENCES);
});

describe('preferencesStore', () => {
  it('defaults to the default language', () => {
    expect(preferencesStore.getLanguage()).toBe(DEFAULT_LANGUAGE);
  });

  it('setLanguage updates the language and persists it', () => {
    preferencesStore.setLanguage(SUPPORTED_LANGUAGE.EN);

    expect(preferencesStore.getLanguage()).toBe(SUPPORTED_LANGUAGE.EN);
    const raw = persistStorage.getItem(STORE_PERSIST_KEY.PREFERENCES);
    expect(JSON.parse(raw ?? 'null')).toEqual({
      state: { language: SUPPORTED_LANGUAGE.EN },
      version: 1,
    });
  });

  it('rehydrate restores a supported language persisted by an earlier run', async () => {
    persistStorage.setItem(
      STORE_PERSIST_KEY.PREFERENCES,
      JSON.stringify({
        state: { language: SUPPORTED_LANGUAGE.EN },
        version: 1,
      }),
    );

    await preferencesStore.rehydrate();

    expect(preferencesStore.getLanguage()).toBe(SUPPORTED_LANGUAGE.EN);
  });

  it('rehydrate keeps the default for a language the app does not ship', async () => {
    persistStorage.setItem(
      STORE_PERSIST_KEY.PREFERENCES,
      JSON.stringify({ state: { language: 'fr' }, version: 1 }),
    );

    await preferencesStore.rehydrate();

    expect(preferencesStore.getLanguage()).toBe(DEFAULT_LANGUAGE);
  });

  it('rehydrate keeps the default for a malformed persisted state', async () => {
    persistStorage.setItem(
      STORE_PERSIST_KEY.PREFERENCES,
      JSON.stringify({ state: null, version: 1 }),
    );

    await preferencesStore.rehydrate();

    expect(preferencesStore.getLanguage()).toBe(DEFAULT_LANGUAGE);
  });

  it('useLanguage reads the language reactively', async () => {
    const { result } = await renderHook(() => preferencesStore.useLanguage());
    expect(result.current).toBe(DEFAULT_LANGUAGE);

    await act(async () => {
      preferencesStore.setLanguage(SUPPORTED_LANGUAGE.EN);
    });
    expect(result.current).toBe(SUPPORTED_LANGUAGE.EN);
  });

  it('reset returns to the default language', () => {
    preferencesStore.setLanguage(SUPPORTED_LANGUAGE.EN);

    preferencesStore.reset();

    expect(preferencesStore.getLanguage()).toBe(DEFAULT_LANGUAGE);
  });
});
