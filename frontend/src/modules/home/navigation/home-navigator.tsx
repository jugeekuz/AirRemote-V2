import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';

import type { HomeStackParamList } from '@app-types';
import HomeScreen from '@modules/home/screens/home-screen';

const Stack = createNativeStackNavigator<HomeStackParamList>();

export default function HomeNavigator() {
  const { t } = useTranslation('screens');

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen
        name="Home"
        component={HomeScreen}
        options={{ title: t('home') }}
      />
    </Stack.Navigator>
  );
}
