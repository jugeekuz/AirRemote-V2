import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';

import type { RootStackParamList } from '@app-types';
import { useAuth } from '@hooks/use-auth';
import { useSessionHydration } from '@hooks/use-session-hydration';
import { useSyncLanguage } from '@hooks/use-sync-language';
import AuthNavigator from '@modules/auth/navigation/auth-navigator';
import HomeNavigator from '@modules/home/navigation/home-navigator';
import LoadingFailedScreen from '@screens/loading-failed-screen';
import LoadingScreen from '@screens/loading-screen';

const Stack = createNativeStackNavigator<RootStackParamList>();

/**
 * Restores the session, then shows Main when signed in and Auth when not.
 * Swapping the screens (not navigating) is what moves the user between them.
 */
export default function RootNavigator() {
  const { retry } = useSessionHydration();
  const { isLoggedIn, isInitializing, hasInitializationFailed } = useAuth();
  const { t } = useTranslation('screens');
  useSyncLanguage();

  if (isInitializing) {
    return <LoadingScreen />;
  }

  if (hasInitializationFailed) {
    return <LoadingFailedScreen onRetry={retry} />;
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {isLoggedIn ? (
        <Stack.Screen
          name="Main"
          component={HomeNavigator}
          options={{ title: t('home') }}
        />
      ) : (
        <Stack.Screen
          name="Auth"
          component={AuthNavigator}
          options={{ title: t('login') }}
        />
      )}
    </Stack.Navigator>
  );
}
