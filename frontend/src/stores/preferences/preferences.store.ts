import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { persistStorage } from '@adapters/storage';
import { DEFAULT_LANGUAGE, type SupportedLanguage } from '@i18n/i18n.constants';
import { STORE_PERSIST_KEY } from '@stores/stores.constants';

type PreferencesState = {
  language: SupportedLanguage;
};

const INITIAL_PREFERENCES_STATE: PreferencesState = {
  language: DEFAULT_LANGUAGE,
};

const usePreferencesStore = create<PreferencesState>()(
  persist(() => INITIAL_PREFERENCES_STATE, {
    name: STORE_PERSIST_KEY.PREFERENCES,
    storage: createJSONStorage(() => persistStorage),
    version: 1,
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
