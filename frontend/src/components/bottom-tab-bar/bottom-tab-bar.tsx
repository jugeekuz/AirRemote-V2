import { Pressable, View } from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import {
  CalendarCog,
  LayoutDashboard,
  Usb,
  type LucideIcon,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { MainTabParamList } from '@app-types';
import { Icon, Image, Text } from '@ui';
import { IMAGES } from '@assets/images';

type TabName = keyof MainTabParamList;

type TabItem = {
  name: TabName;
  /** Not built yet: shown greyed and not pressable. */
  isInert: boolean;
  icon: LucideIcon | undefined;
};

/** V1's four items, in order. Remotes draws `remote.svg` instead of an icon. */
const TAB_ITEMS: TabItem[] = [
  {
    name: 'Dashboard',
    isInert: true,
    icon: LayoutDashboard,
  },
  { name: 'Remotes', isInert: false, icon: undefined },
  { name: 'Devices', isInert: false, icon: Usb },
  {
    name: 'Automations',
    isInert: true,
    icon: CalendarCog,
  },
];

const BAR_HEIGHT = 64;

/** V1's mobile bottom bar: icon over a 12 px label, green when active. */
export default function BottomTabBar({ state, navigation }: BottomTabBarProps) {
  const { t } = useTranslation('chrome');
  const { bottom } = useSafeAreaInsets();
  const labels: Record<TabName, string> = {
    Dashboard: t('bottom-tab-bar.dashboard'),
    Remotes: t('bottom-tab-bar.remotes'),
    Devices: t('bottom-tab-bar.devices'),
    Automations: t('bottom-tab-bar.automations'),
  };
  const activeName = state.routes[state.index]?.name;

  return (
    <View
      accessibilityRole="tablist"
      className="w-full flex-row items-center justify-around border border-gray-200 bg-white py-2"
      style={{
        height: BAR_HEIGHT + bottom,
        paddingBottom: 8 + bottom,
        boxShadow: '0 -1px 6px -1px rgba(0, 0, 0, 0.1)',
      }}
    >
      {TAB_ITEMS.map((item) => {
        const route = state.routes.find(({ name }) => name === item.name);
        if (!route) {
          return null;
        }
        const label = labels[item.name];
        const isActive = !item.isInert && activeName === item.name;
        const color = isActive ? 'text-green-500' : 'text-gray-500';

        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityLabel={label}
            accessibilityHint={
              item.isInert ? t('bottom-tab-bar.unavailable') : undefined
            }
            accessibilityState={{
              selected: isActive,
              disabled: item.isInert,
            }}
            // react-native-web ignores accessibilityState; browsers read these.
            aria-selected={isActive}
            aria-disabled={item.isInert}
            disabled={item.isInert}
            onPress={() => {
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });
              if (!isActive && !event.defaultPrevented) {
                navigation.navigate(route.name);
              }
            }}
            className={`items-center ${item.isInert ? 'opacity-50' : ''}`}
          >
            {item.icon ? (
              <Icon
                as={item.icon}
                size={20}
                strokeWidth={1.7}
                colorClassName={color}
              />
            ) : (
              <Image
                source={IMAGES.remote}
                contentFit="contain"
                tintColorClassName={
                  isActive ? 'accent-green-500' : 'accent-gray-500'
                }
                className="size-5 rotate-45"
              />
            )}
            <Text className={`text-xs ${color}`}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
