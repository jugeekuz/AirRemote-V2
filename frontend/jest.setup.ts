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

// Jest has no compiled CSS (Metro's Uniwind transformer makes it), so give
// the one theme variable the kit reads from JavaScript its stylesheet value.
for (const theme of ['light', 'dark'] as const) {
  Uniwind.updateCSSVariables(theme, { '--theme': 'default' });
}
