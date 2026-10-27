import { z } from 'zod';

import type { AppEnv, RawEnv } from './env.types';

const envSchema = z.object({
  EXPO_PUBLIC_APP_ENV: z.enum(['development', 'production']),
  EXPO_PUBLIC_API_URL: z.url({ protocol: /^https?$/ }),
});

/** Validates the raw variables and names every one that is missing or wrong. */
export function parseEnv(raw: RawEnv): AppEnv {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment: ${problems}`);
  }
  return {
    appEnv: result.data.EXPO_PUBLIC_APP_ENV,
    apiUrl: result.data.EXPO_PUBLIC_API_URL.replace(/\/+$/, ''),
  };
}

// Each variable is read by its full name so Expo can inline it into the bundle.
export const ENV: Readonly<AppEnv> = Object.freeze(
  parseEnv({
    EXPO_PUBLIC_APP_ENV: process.env.EXPO_PUBLIC_APP_ENV,
    EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL,
  }),
);
