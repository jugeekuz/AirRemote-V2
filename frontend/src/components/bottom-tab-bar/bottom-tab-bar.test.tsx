import { View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer } from '@react-navigation/native';

import { renderWithProviders, screen, userEvent } from '@utils/tests';

import BottomTabBar from './bottom-tab-bar';

const Tab = createBottomTabNavigator();

function Page({ label }: { label: string }) {
  return <View testID={`page-${label}`} />;
}

async function renderBar(initialRouteName = 'Remotes') {
  await renderWithProviders(
    <NavigationContainer>
      <Tab.Navigator
        initialRouteName={initialRouteName}
        tabBar={(props) => <BottomTabBar {...props} />}
        screenOptions={{ headerShown: false }}
      >
        <Tab.Screen name="Dashboard">
          {() => <Page label="Dashboard" />}
        </Tab.Screen>
        <Tab.Screen name="Remotes">{() => <Page label="Remotes" />}</Tab.Screen>
        <Tab.Screen name="Devices">{() => <Page label="Devices" />}</Tab.Screen>
        <Tab.Screen name="Automations">
          {() => <Page label="Automations" />}
        </Tab.Screen>
      </Tab.Navigator>
    </NavigationContainer>,
  );
}

describe('BottomTabBar', () => {
  it('lists the four tabs in V1 order', async () => {
    await renderBar();

    expect(
      screen.getAllByRole('tab').map((tab) => tab.props.accessibilityLabel),
    ).toEqual([
      'bottom-tab-bar.dashboard',
      'bottom-tab-bar.remotes',
      'bottom-tab-bar.devices',
      'bottom-tab-bar.automations',
    ]);
  });

  it('marks only the current tab as selected', async () => {
    await renderBar();

    expect(
      screen.getByRole('tab', { name: 'bottom-tab-bar.remotes' }),
    ).toBeSelected();
    expect(
      screen.getByRole('tab', { name: 'bottom-tab-bar.devices' }),
    ).not.toBeSelected();
  });

  it('switches to the tab that is pressed', async () => {
    await renderBar();

    await userEvent.press(
      screen.getByRole('tab', { name: 'bottom-tab-bar.devices' }),
    );

    expect(
      screen.getByRole('tab', { name: 'bottom-tab-bar.devices' }),
    ).toBeSelected();
    expect(screen.getByTestId('page-Devices')).toBeOnTheScreen();
  });

  it('keeps Dashboard and Automations disabled with a hint', async () => {
    await renderBar();

    for (const name of ['dashboard', 'automations']) {
      const tab = screen.getByRole('tab', { name: `bottom-tab-bar.${name}` });
      expect(tab).toBeDisabled();
      expect(tab.props.accessibilityHint).toBe('bottom-tab-bar.unavailable');
    }
    await userEvent.press(
      screen.getByRole('tab', { name: 'bottom-tab-bar.automations' }),
    );
    expect(
      screen.getByRole('tab', { name: 'bottom-tab-bar.remotes' }),
    ).toBeSelected();
  });
});
