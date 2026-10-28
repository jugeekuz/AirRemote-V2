import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useTranslation } from 'react-i18next';

import type { MainTabParamList } from '@app-types';
import DevicesNavigator from '@modules/devices/navigation/devices-navigator';
import RemotesNavigator from '@modules/remotes/navigation/remotes-navigator';
import BottomTabBar from '@components/bottom-tab-bar';

const Tab = createBottomTabNavigator<MainTabParamList>();

/** Never shown: the bar keeps Dashboard and Automations from being opened. */
function NotAvailable() {
  return null;
}

/** The signed-in app: V1's four tabs, opening on Remotes. */
export default function MainTabs() {
  const { t } = useTranslation('chrome');

  return (
    <Tab.Navigator
      initialRouteName="Remotes"
      tabBar={(props) => <BottomTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tab.Screen
        name="Dashboard"
        component={NotAvailable}
        options={{ title: t('bottom-tab-bar.dashboard') }}
      />
      <Tab.Screen
        name="Remotes"
        component={RemotesNavigator}
        options={{ title: t('bottom-tab-bar.remotes') }}
      />
      <Tab.Screen
        name="Devices"
        component={DevicesNavigator}
        options={{ title: t('bottom-tab-bar.devices') }}
      />
      <Tab.Screen
        name="Automations"
        component={NotAvailable}
        options={{ title: t('bottom-tab-bar.automations') }}
      />
    </Tab.Navigator>
  );
}
