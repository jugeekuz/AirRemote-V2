import enAuth from '@modules/auth/i18n/locales/en/auth.json';
import enHome from '@modules/home/i18n/locales/en/home.json';

import enActions from './locales/en/actions.json';
import enMessages from './locales/en/messages.json';
import enScreens from './locales/en/screens.json';

/** Every namespace per language: the global ones, then one per module. */
export const resources = {
  en: {
    actions: enActions,
    messages: enMessages,
    screens: enScreens,
    auth: enAuth,
    home: enHome,
  },
} as const;
