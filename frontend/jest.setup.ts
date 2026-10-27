// Matchers from @testing-library/react-native (toBeOnTheScreen, ...) are
// registered when it is imported; nothing to set up globally yet.
// Tests run without Expo's .env files, so give the config module its inputs.
process.env.EXPO_PUBLIC_APP_ENV = 'development';
process.env.EXPO_PUBLIC_API_URL = 'http://localhost:3000';
