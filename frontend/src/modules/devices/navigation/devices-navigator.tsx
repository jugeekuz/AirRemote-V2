import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';

import type { DevicesStackParamList } from '@app-types';
import DeviceListScreen from '@modules/devices/screens/device-list-screen';

const Stack = createNativeStackNavigator<DevicesStackParamList>();

export default function DevicesNavigator() {
  const { t } = useTranslation('devices');

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen
        name="DeviceList"
        component={DeviceListScreen}
        options={{ title: t('device-list.title') }}
      />
    </Stack.Navigator>
  );
}
