import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';

import { logError } from '@utils/logger';

import { DEFAULT_LANGUAGE, DEFAULT_NAMESPACE } from './i18n.constants';
import { resources } from './resources';

// Resources are bundled, so this settles synchronously: `t` works as soon as
// this module has run. Import it once, before the first render.
i18next
  .use(initReactI18next)
  .init({
    resources,
    lng: DEFAULT_LANGUAGE,
    fallbackLng: DEFAULT_LANGUAGE,
    defaultNS: DEFAULT_NAMESPACE,
    // React already escapes what it renders.
    interpolation: { escapeValue: false },
  })
  .catch((error: unknown) => {
    logError('i18n.init', error);
  });
