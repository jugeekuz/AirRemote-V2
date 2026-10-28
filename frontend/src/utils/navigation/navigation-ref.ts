import { createNavigationContainerRef } from '@react-navigation/native';

import type { RootStackParamList } from '@app-types';

/**
 * For navigating OUTSIDE React (e.g. a notification handler). Inside
 * components, use `useNavigation()`.
 */
export const navigationRef = createNavigationContainerRef<RootStackParamList>();

/** Goes back when there is somewhere to go; does nothing before the container is ready. */
export function navigateBack(): void {
  if (navigationRef.isReady() && navigationRef.canGoBack()) {
    navigationRef.goBack();
  }
}
