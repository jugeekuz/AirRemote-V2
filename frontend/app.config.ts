import type { ConfigContext, ExpoConfig } from 'expo/config';

// Only this file and src/config read process.env.
const isDevelopment =
  (process.env.EXPO_PUBLIC_APP_ENV ?? 'development') === 'development';

const APP_ID = 'com.airremote.app';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: isDevelopment ? 'AirRemote Dev' : 'AirRemote',
  slug: 'airremote',
  scheme: 'airremote',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  // V1 is light-only (src/ui/ui-provider fixes the kit's theme to light).
  userInterfaceStyle: 'light',
  ios: {
    supportsTablet: true,
    bundleIdentifier: isDevelopment ? `${APP_ID}.dev` : APP_ID,
  },
  android: {
    package: isDevelopment ? `${APP_ID}.dev` : APP_ID,
    adaptiveIcon: {
      backgroundColor: '#E6F4FE',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
  },
  web: {
    bundler: 'metro',
    favicon: './assets/favicon.png',
  },
  plugins: ['expo-font', 'expo-image'],
  experiments: {
    // Metro resolves the import aliases from tsconfig.json `paths`.
    tsconfigPaths: true,
  },
});
