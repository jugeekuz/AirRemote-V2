import type { LinkingOptions } from '@react-navigation/native';

import type { RootStackParamList } from '@app-types';

/** URLs for each screen: `airremote://login` on native, `/login` on web. */
export const linking: LinkingOptions<RootStackParamList> = {
  prefixes: ['airremote://'],
  config: {
    screens: {
      Auth: { screens: { Login: 'login', SignUp: 'sign-up' } },
      Main: { screens: { Home: '' } },
    },
  },
};
