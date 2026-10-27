import { useEffect } from 'react';
import i18next from 'i18next';

import { logError } from '@utils/logger';
import { preferencesStore } from '@stores/preferences';

/** Keeps i18next on the language stored in the preferences. Call it once, near the root. */
export function useSyncLanguage(): void {
  const language = preferencesStore.useLanguage();

  useEffect(() => {
    if (i18next.language === language) {
      return;
    }
    i18next.changeLanguage(language).catch((error: unknown) => {
      logError('useSyncLanguage', error);
    });
  }, [language]);
}
