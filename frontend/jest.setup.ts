import 'react-native-gesture-handler/jestSetup';

import { Uniwind } from 'uniwind';

// Matchers from @testing-library/react-native (toBeOnTheScreen, ...) are
// registered when it is imported.
// Tests run without Expo's .env files, so give the config module its inputs.
process.env.EXPO_PUBLIC_APP_ENV = 'development';
process.env.EXPO_PUBLIC_API_URL = 'http://localhost:3000';

// The UI kit's native modules have no native side under Jest. Reanimated runs
// its own JS implementation on top of Worklets' mock; Gesture Handler is set
// up by its `jestSetup` above.
jest.mock('react-native-worklets', () =>
  jest.requireActual('react-native-worklets/src/mock'),
);
// Zero insets and a fixed frame, with or without a SafeAreaProvider.
jest.mock(
  'react-native-safe-area-context',
  () =>
    jest.requireActual<{ default: unknown }>(
      'react-native-safe-area-context/jest/mock',
    ).default,
);

// App-level mocks. Tests get a fixed environment, an in-memory store instead
// of MMKV, NetInfo's bundled mock, and a `t` that echoes its input so tests
// can assert keys and interpolation without real translations.
jest.mock('@config/env', () => ({
  ENV: { appEnv: 'development', apiUrl: 'https://api.test' },
}));
jest.mock('@adapters/storage', () => {
  const store = new Map<string, string>();
  return {
    persistStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
    },
  };
});
jest.mock('@react-native-community/netinfo', () =>
  jest.requireActual('@react-native-community/netinfo/jest/netinfo-mock'),
);
// `t('key')` returns 'key'; `t('key', { a: 1, b: 'x' })` returns
// 'key | a: 1 | b: x'. `ns` selects a namespace, so it is left out.
// Virtual: the package is installed with the i18n layer.
jest.mock(
  'react-i18next',
  () => ({
    useTranslation: () => ({
      t: (key: string, options?: Record<string, unknown>) => {
        const params = Object.entries(options ?? {}).filter(
          ([name]) => name !== 'ns',
        );
        return [
          key,
          ...params.map(([name, value]) => `${name}: ${String(value)}`),
        ].join(' | ');
      },
      i18n: { language: 'en', changeLanguage: jest.fn() },
    }),
    Trans: ({ i18nKey }: { i18nKey?: string }) => i18nKey ?? null,
    initReactI18next: { type: '3rdParty', init: jest.fn() },
  }),
  { virtual: true },
);

// Jest has no compiled CSS (Metro's Uniwind transformer makes it), so give
// the one theme variable the kit reads from JavaScript its stylesheet value.
for (const theme of ['light', 'dark'] as const) {
  Uniwind.updateCSSVariables(theme, { '--theme': 'default' });
}
