import type { NavigatorScreenParams } from '@react-navigation/native';

export type AuthStackParamList = {
  Login: undefined;
  SignUp: undefined;
};

export type HomeStackParamList = {
  Home: undefined;
};

/** `Auth` while signed out, `Main` while signed in; never both. */
export type RootStackParamList = {
  Auth: NavigatorScreenParams<AuthStackParamList>;
  Main: NavigatorScreenParams<HomeStackParamList>;
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
