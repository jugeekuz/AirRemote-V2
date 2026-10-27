import '@ui/global.css';

import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Text, UiProvider } from '@ui';

// Temporary: replaced by the real app shell.
export default function App() {
  return (
    <SafeAreaProvider>
      <UiProvider>
        <View className="flex-1 items-center justify-center bg-background">
          <Text>AirRemote</Text>
        </View>
        <StatusBar style="auto" />
      </UiProvider>
    </SafeAreaProvider>
  );
}
