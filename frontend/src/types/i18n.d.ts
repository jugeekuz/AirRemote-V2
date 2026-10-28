import 'i18next';

import type { DEFAULT_NAMESPACE } from '@i18n/i18n.constants';
import type { resources } from '@i18n/resources';

// Typed keys: a misspelled key or namespace is a compile error.
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: typeof DEFAULT_NAMESPACE;
    resources: (typeof resources)['en'];
  }
}
