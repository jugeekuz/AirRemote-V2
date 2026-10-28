import type { ReactNode } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { HeroUINativeProvider } from '@ui/heroui/providers/hero-ui-native';
import type { HeroUINativeConfig } from '@ui/heroui/providers/hero-ui-native';
import ToastBridge from '@ui/toast/toast-bridge';

type UiProviderProps = {
  children: ReactNode;
};

// The kit logs its styling guide on every start in development.
const config: HeroUINativeConfig = {
  devInfo: { stylingPrinciples: false },
};

/**
 * Everything the kit needs around the app (gesture root, theme, portals,
 * toasts), plus the bridge behind the imperative `toast`. It must sit inside
 * a `SafeAreaProvider`.
 */
export default function UiProvider({ children }: UiProviderProps) {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <HeroUINativeProvider config={config}>
        {children}
        <ToastBridge />
      </HeroUINativeProvider>
    </GestureHandlerRootView>
  );
}
