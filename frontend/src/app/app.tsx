import '@ui/global.css';

import {
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
} from '@expo-google-fonts/poppins';
import { QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import RootNavigationContainer from '@navigation/root-navigation-container';
import LoadingScreen from '@screens/loading-screen';
import { UiProvider } from '@ui';

import { queryClient } from './query-client';

// Poppins where V1 used it; the family names are the `font-poppins*` classes
// in src/ui/theme.css.
const FONTS = {
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
};

// UiProvider includes the gesture root, so none is needed here.
export default function App() {
  const [fontsLoaded, fontError] = useFonts(FONTS);
  // A font that fails to load falls back to the system font.
  const fontsReady = fontsLoaded || fontError !== null;

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <UiProvider>
          {fontsReady ? <RootNavigationContainer /> : <LoadingScreen />}
          <StatusBar style="dark" />
        </UiProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
