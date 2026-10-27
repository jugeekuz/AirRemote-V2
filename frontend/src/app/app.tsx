import '@ui/global.css';

import { QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import RootNavigationContainer from '@navigation/root-navigation-container';
import { UiProvider } from '@ui';

import { queryClient } from './query-client';

// UiProvider includes the gesture root, so none is needed here.
export default function App() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <UiProvider>
          <RootNavigationContainer />
          <StatusBar style="auto" />
        </UiProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
