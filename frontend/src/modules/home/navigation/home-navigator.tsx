import { View } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';

import type { HomeStackParamList } from '@app-types';
import { Text } from '@ui';

const Stack = createNativeStackNavigator<HomeStackParamList>();

// Temporary: replaced by the real Home screen.
function HomePlaceholderScreen() {
  const { t } = useTranslation('screens');

  return (
    <View className="flex-1 items-center justify-center bg-background">
      <Text>{t('home')}</Text>
    </View>
  );
}

export default function HomeNavigator() {
  const { t } = useTranslation('screens');

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen
        name="Home"
        component={HomePlaceholderScreen}
        options={{ title: t('home') }}
      />
    </Stack.Navigator>
  );
}
