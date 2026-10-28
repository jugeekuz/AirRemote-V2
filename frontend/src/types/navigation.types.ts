import type { NavigatorScreenParams } from '@react-navigation/native';

export type AuthStackParamList = {
  Login: undefined;
  SignUp: undefined;
};

export type RemotesStackParamList = {
  RemoteList: undefined;
  RemoteDetails: { remoteId: string };
};

export type DevicesStackParamList = {
  /** `pairMac` and `pairCode` come from a pairing link (`/pair?mac=&code=`). */
  DeviceList: { pairMac?: string; pairCode?: string } | undefined;
};

/** Dashboard and Automations are in the bar but not built yet. */
export type MainTabParamList = {
  Dashboard: undefined;
  Remotes: NavigatorScreenParams<RemotesStackParamList>;
  Devices: NavigatorScreenParams<DevicesStackParamList>;
  Automations: undefined;
};

/** `Auth` while signed out, `Main` while signed in; never both. */
export type RootStackParamList = {
  Auth: NavigatorScreenParams<AuthStackParamList>;
  Main: NavigatorScreenParams<MainTabParamList>;
};

// Types useNavigation() and <Link> everywhere without generics. React
// Navigation declares RootParamList in this global namespace, so augmenting it
// needs one too.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ReactNavigation {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface RootParamList extends RootStackParamList {}
  }
}
