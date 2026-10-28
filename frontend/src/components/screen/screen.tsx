import type { ReactNode } from 'react';
import { View } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import styles from './screen.styles';

type ScreenProps = {
  children: ReactNode;
  /**
   * Also keep clear of the bottom (home indicator): screens without the tab
   * bar, which pads the bottom itself. @default false
   */
  hasBottomInset?: boolean;
};

const EDGES_WITH_TAB_BAR: readonly Edge[] = Object.freeze([
  'top',
  'left',
  'right',
]);
const EDGES_ALONE: readonly Edge[] = Object.freeze([
  'top',
  'left',
  'right',
  'bottom',
]);

/**
 * Every screen's outer container: a white page whose content keeps clear
 * of the status bar, the notch and rounded corners. The inset stays put
 * when the content scrolls.
 */
export default function Screen({
  children,
  hasBottomInset = false,
}: ScreenProps) {
  return (
    <View className="flex-1 bg-background">
      <SafeAreaView
        testID="screen-safe-area"
        style={styles.safeArea}
        edges={hasBottomInset ? EDGES_ALONE : EDGES_WITH_TAB_BAR}
      >
        {children}
      </SafeAreaView>
    </View>
  );
}
