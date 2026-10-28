import {
  getStateFromPath,
  type LinkingOptions,
  type NavigationState,
  type PartialState,
  type PathConfig,
} from '@react-navigation/native';

import type { RemotesStackParamList, RootStackParamList } from '@app-types';
import { AUTH_STATUS, authStore } from '@stores/auth';
import { pendingPairingStore } from '@stores/pending-pairing';
import { getPairingDetails } from '@modules/devices/helpers/pairing';

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

/** The device list's params anywhere in the state, if it is in it. */
function findDeviceListParams(state: LinkState): object | undefined {
  for (const route of state.routes) {
    if (route.name === 'DeviceList') {
      return route.params;
    }
    const nested = route.state ? findDeviceListParams(route.state) : undefined;
    if (nested) {
      return nested;
    }
  }
  return undefined;
}

function readString(params: object, name: string): string | undefined {
  const value: unknown = Reflect.get(params, name);
  return typeof value === 'string' ? value : undefined;
}

/**
 * Without a session the root navigator shows Login and drops the link's
 * state, so a valid pairing is kept for the device list to open after
 * sign-in. While the session is still being restored nobody knows yet, so
 * it is kept too; the device list clears it when the link reaches it.
 */
function keepPairingUntilSignedIn(state: LinkState) {
  if (authStore.getStatus() === AUTH_STATUS.AUTHENTICATED) {
    return;
  }
  const params = findDeviceListParams(state);
  const pairing = params
    ? getPairingDetails(
        readString(params, 'pairMac'),
        readString(params, 'pairCode'),
      )
    : null;
  if (pairing) {
    pendingPairingStore.set(pairing);
  }
}

/**
 * React Navigation's parser, then the pairing link's parameter names. A
 * pairing link that arrives signed out is kept for after sign-in.
 */
export function getStateFromLink(path: string): LinkState | undefined {
  const parsed = getStateFromPath<RootStackParamList>(path, config);
  if (!parsed) {
    return undefined;
  }
  const state = renamePairingParams(parsed);
  keepPairingUntilSignedIn(state);
  return state;
}

/** URLs for each screen: `airremote://login` on native, `/login` on web. */
export const linking: LinkingOptions<RootStackParamList> = {
  prefixes: ['airremote://'],
  config,
  getStateFromPath: (path) => getStateFromLink(path),
};
