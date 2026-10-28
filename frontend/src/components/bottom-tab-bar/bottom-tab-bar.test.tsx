import type { PressableProps } from 'react-native';
import { View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer } from '@react-navigation/native';

import { renderWithProviders, screen, userEvent } from '@utils/tests';

import BottomTabBar from './bottom-tab-bar';

// React Native folds ARIA props into the host's accessibilityState, so the
// props react-native-web reads are checked where they are passed.
const mockPressableProps: PressableProps[] = [];
jest.mock('react-native', () => {
  const RN = jest.requireActual<typeof import('react-native')>('react-native');
  const { createElement } = jest.requireActual<typeof import('react')>('react');
  // React 19 passes `ref` as a prop, so spreading the props forwards it.
  function Pressable(props: PressableProps) {
    mockPressableProps.push(props);
    return createElement(RN.Pressable, props);
  }
  return Object.setPrototypeOf({ Pressable }, RN);
});

/** The props the last render passed to the Pressable named `label`. */
function lastPressableProps(label: string) {
  return mockPressableProps.findLast(
    (props) => props.accessibilityLabel === label,
  );
}

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

    const remotes = screen.getByRole('tab', { name: 'bottom-tab-bar.remotes' });
    const devices = screen.getByRole('tab', { name: 'bottom-tab-bar.devices' });
    expect(remotes).toBeSelected();
    expect(devices).not.toBeSelected();
    // react-native-web reads only the ARIA props, not accessibilityState.
    expect(lastPressableProps('bottom-tab-bar.remotes')).toMatchObject({
      'aria-selected': true,
      'aria-disabled': false,
    });
    expect(lastPressableProps('bottom-tab-bar.devices')).toMatchObject({
      'aria-selected': false,
    });
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
      expect(lastPressableProps(`bottom-tab-bar.${name}`)).toMatchObject({
        'aria-disabled': true,
      });
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
