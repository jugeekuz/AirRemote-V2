import { View } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';

import type { AuthStackParamList } from '@app-types';
import { Text } from '@ui';

const Stack = createNativeStackNavigator<AuthStackParamList>();

// Temporary: replaced by the real Login screen.
function LoginPlaceholderScreen() {
  const { t } = useTranslation('screens');

  return (
    <View className="flex-1 items-center justify-center bg-background">
      <Text>{t('login')}</Text>
    </View>
  );
}

export default function AuthNavigator() {
  const { t } = useTranslation('screens');

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen
        name="Login"
        component={LoginPlaceholderScreen}
        options={{ title: t('login') }}
      />
    </Stack.Navigator>
  );
}
