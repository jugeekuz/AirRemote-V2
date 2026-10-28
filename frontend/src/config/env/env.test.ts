import { parseEnv } from './env';

describe('parseEnv', () => {
  it('reads the app environment and API URL', () => {
    expect(
      parseEnv({
        EXPO_PUBLIC_APP_ENV: 'production',
        EXPO_PUBLIC_API_URL: 'https://api.example.com',
      }),
    ).toEqual({ appEnv: 'production', apiUrl: 'https://api.example.com' });
  });

  it('names every missing variable', () => {
    expect(() => parseEnv({})).toThrow(Error);
    expect(() => parseEnv({})).toThrow(/EXPO_PUBLIC_APP_ENV/);
    expect(() => parseEnv({})).toThrow(/EXPO_PUBLIC_API_URL/);
  });

  it('rejects an unknown environment', () => {
    expect(() =>
      parseEnv({
        EXPO_PUBLIC_APP_ENV: 'stage',
        EXPO_PUBLIC_API_URL: 'https://api.example.com',
      }),
    ).toThrow();
  });

  it('rejects an API URL that is not a URL', () => {
    expect(() =>
      parseEnv({
        EXPO_PUBLIC_APP_ENV: 'development',
        EXPO_PUBLIC_API_URL: 'localhost:3000',
      }),
    ).toThrow();
  });

  it('drops a trailing slash from the API URL', () => {
    expect(
      parseEnv({
        EXPO_PUBLIC_APP_ENV: 'development',
        EXPO_PUBLIC_API_URL: 'http://localhost:3000/',
      }).apiUrl,
    ).toBe('http://localhost:3000');
  });
});
