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
jest.mock('react-i18next', () => ({
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
}));

// Jest has no compiled CSS (Metro's Uniwind transformer makes it), so give
// the theme variables the kit reads from JavaScript their stylesheet values
// (heroui/styles/theme.css and variables.css, with `var()`s resolved). Button
// reads the four hover colours below.
const SNOW = 'oklch(0.9911 0 0)';
const ECLIPSE = 'oklch(0.2103 0.0059 285.89)';
const ACCENT = 'oklch(0.6204 0.195 253.83)';
const THEME_DEFAULTS = {
  light: {
    default: 'oklch(94% 0.001 286.375)',
    foreground: ECLIPSE,
    danger: 'oklch(0.6532 0.2328 25.74)',
  },
  dark: {
    default: 'oklch(27.4% 0.006 286.033)',
    foreground: SNOW,
    danger: 'oklch(0.594 0.1967 24.63)',
  },
} as const;
for (const theme of ['light', 'dark'] as const) {
  const colors = THEME_DEFAULTS[theme];
  Uniwind.updateCSSVariables(theme, {
    '--theme': 'default',
    '--color-accent-hover': `color-mix(in oklab, ${ACCENT} 90%, ${SNOW} 10%)`,
    '--color-default-hover': `color-mix(in oklab, ${colors.default} 96%, ${colors.foreground} 4%)`,
    '--color-danger-hover': `color-mix(in oklab, ${colors.danger} 90%, ${SNOW} 10%)`,
    '--color-danger-soft-hover': `color-mix(in oklab, ${colors.danger} 20%, transparent)`,
  });
}
