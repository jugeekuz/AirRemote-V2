import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';

import type { RemotesStackParamList } from '@app-types';
import RemoteDetailsScreen from '@modules/remotes/screens/remote-details-screen';
import RemoteListScreen from '@modules/remotes/screens/remote-list-screen';

const Stack = createNativeStackNavigator<RemotesStackParamList>();

export default function RemotesNavigator() {
  const { t } = useTranslation('remotes');

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen
        name="RemoteList"
        component={RemoteListScreen}
        options={{ title: t('remote-list.title') }}
      />
      <Stack.Screen
        name="RemoteDetails"
        component={RemoteDetailsScreen}
        options={{ title: t('remote-details.title') }}
      />
    </Stack.Navigator>
  );
}
