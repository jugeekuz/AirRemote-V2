import {
  getStateFromPath,
  type LinkingOptions,
  type NavigationState,
  type PartialState,
  type PathConfig,
} from '@react-navigation/native';

import type { RemotesStackParamList, RootStackParamList } from '@app-types';

type LinkState = PartialState<NavigationState>;
type LinkConfig = NonNullable<LinkingOptions<RootStackParamList>['config']>;

// A deep link to a remote's page still has the list to go back to.
const remotesConfig: PathConfig<RemotesStackParamList> = {
  initialRouteName: 'RemoteList',
  screens: {
    RemoteList: 'remotes',
    RemoteDetails: 'remotes/:remoteId',
  },
};

const config: LinkConfig = {
  screens: {
    Auth: { screens: { Login: 'login', SignUp: 'sign-up' } },
    Main: {
      screens: {
        Remotes: remotesConfig,
        Devices: {
          screens: {
            // A pairing link (`pair?mac=…&code=…`) opens the device list.
            DeviceList: { path: 'devices', alias: ['pair'] },
          },
        },
      },
    },
  },
};

/** The pairing link's `mac` and `code` are the device list's `pairMac` and `pairCode`. */
const PAIRING_PARAMS: Record<string, string> = {
  mac: 'pairMac',
  code: 'pairCode',
};

function renamePairingParams(state: LinkState): LinkState {
  return {
    ...state,
    routes: state.routes.map((route) => {
      const nested = route.state ? renamePairingParams(route.state) : undefined;
      const params =
        route.name === 'DeviceList' && route.params
          ? Object.fromEntries(
              Object.entries(route.params).map(([key, value]) => [
                PAIRING_PARAMS[key] ?? key,
                value,
              ]),
            )
          : route.params;
      return { ...route, params, state: nested };
    }),
  };
}

/** React Navigation's parser, then the pairing link's parameter names. */
export function getStateFromLink(path: string): LinkState | undefined {
  const state = getStateFromPath<RootStackParamList>(path, config);
  return state ? renamePairingParams(state) : undefined;
}

/** URLs for each screen: `airremote://login` on native, `/login` on web. */
export const linking: LinkingOptions<RootStackParamList> = {
  prefixes: ['airremote://'],
  config,
  getStateFromPath: (path) => getStateFromLink(path),
};
