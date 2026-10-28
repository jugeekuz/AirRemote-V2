import enAuth from '@modules/auth/i18n/locales/en/auth.json';
import enDevices from '@modules/devices/i18n/locales/en/devices.json';
import enRemotes from '@modules/remotes/i18n/locales/en/remotes.json';

import enActions from './locales/en/actions.json';
import enChrome from './locales/en/chrome.json';
import enMessages from './locales/en/messages.json';
import enScreens from './locales/en/screens.json';

/** Every namespace per language: the global ones, then one per module. */
export const resources = {
  en: {
    actions: enActions,
    chrome: enChrome,
    messages: enMessages,
    screens: enScreens,
    auth: enAuth,
    devices: enDevices,
    remotes: enRemotes,
  },
} as const;
