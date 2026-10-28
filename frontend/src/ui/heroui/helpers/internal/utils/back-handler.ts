import { BackHandler, Platform } from 'react-native';
import type { NativeEventSubscription } from 'react-native';

/**
 * `BackHandler.addEventListener`, except on web: there is no hardware back
 * button, and react-native-web logs an error for every call.
 */
export function addBackHandlerListener(
  ...args: Parameters<typeof BackHandler.addEventListener>
): NativeEventSubscription {
  if (Platform.OS === 'web') {
    return { remove: () => {} };
  }
  return BackHandler.addEventListener(...args);
}
