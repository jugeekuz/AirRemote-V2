import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { persistStorage } from '@adapters/storage';
import { STORE_PERSIST_KEY } from '@stores/stores.constants';
import { isSupportedLanguage } from '@helpers/i18n';
import { DEFAULT_LANGUAGE, type SupportedLanguage } from '@i18n/i18n.constants';

type PreferencesState = {
  language: SupportedLanguage;
};

const INITIAL_PREFERENCES_STATE: PreferencesState = {
  language: DEFAULT_LANGUAGE,
};

/**
 * Restores only what is still valid: a language the app no longer ships (or a
 * malformed value) keeps the default.
 */
function mergePersistedPreferences(
  persisted: unknown,
  current: PreferencesState,
): PreferencesState {
  const language =
    typeof persisted === 'object' &&
    persisted !== null &&
    'language' in persisted &&
    isSupportedLanguage(persisted.language)
      ? persisted.language
      : current.language;
  return { ...current, language };
}

const usePreferencesStore = create<PreferencesState>()(
  persist(() => INITIAL_PREFERENCES_STATE, {
    name: STORE_PERSIST_KEY.PREFERENCES,
    storage: createJSONStorage(() => persistStorage),
    version: 1,
    merge: mergePersistedPreferences,
  }),
);

/** The user's app preferences, kept across restarts. */
export const preferencesStore = {
  setLanguage(language: SupportedLanguage) {
    usePreferencesStore.setState({ language });
  },
  reset() {
    usePreferencesStore.setState(INITIAL_PREFERENCES_STATE);
  },
  /** Reads the persisted value again. The store already did so when it was created. */
  rehydrate: () => usePreferencesStore.persist.rehydrate(),

  getLanguage: () => usePreferencesStore.getState().language,

  useLanguage: () => usePreferencesStore((state) => state.language),
};
