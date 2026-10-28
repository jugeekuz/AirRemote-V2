import { useColorScheme } from 'react-native';
import {
  DarkTheme,
  DefaultTheme,
  NavigationContainer,
  type DocumentTitleOptions,
} from '@react-navigation/native';

import { navigationRef } from '@utils/navigation';

import { linking } from './linking';
import RootNavigator from './root-navigator';

const APP_NAME = 'AirRemote';

/** The browser tab's title on web: the screen's title, then the app's. */
const documentTitle: DocumentTitleOptions = {
  formatter: (options, route) => {
    const title: unknown = options?.title ?? route?.name;
    return typeof title === 'string' && title !== ''
      ? `${title} · ${APP_NAME}`
      : APP_NAME;
  },
};

export default function RootNavigationContainer() {
  const colorScheme = useColorScheme();

  return (
    <NavigationContainer
      ref={navigationRef}
      linking={linking}
      theme={colorScheme === 'dark' ? DarkTheme : DefaultTheme}
      documentTitle={documentTitle}
    >
      <RootNavigator />
    </NavigationContainer>
  );
}
