import { Platform } from 'react-native';

export const isWebPlatform = Platform.OS === 'web';
export const isIOSPlatform = Platform.OS === 'ios';
export const isAndroidPlatform = Platform.OS === 'android';
export const isNativeMobilePlatform = isIOSPlatform || isAndroidPlatform;
