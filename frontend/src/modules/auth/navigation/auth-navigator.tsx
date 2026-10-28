import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';

import type { AuthStackParamList } from '@app-types';
import LoginScreen from '@modules/auth/screens/login-screen';
import SignUpScreen from '@modules/auth/screens/sign-up-screen';

const Stack = createNativeStackNavigator<AuthStackParamList>();

export default function AuthNavigator() {
  const { t } = useTranslation('auth');

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen
        name="Login"
        component={LoginScreen}
        options={{ title: t('login.title') }}
      />
      <Stack.Screen
        name="SignUp"
        component={SignUpScreen}
        options={{ title: t('sign-up.title') }}
      />
    </Stack.Navigator>
  );
}
