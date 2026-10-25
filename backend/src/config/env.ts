import { z } from 'zod';

const secret = z
  .string()
  .min(32, 'must be at least 32 characters (e.g. `openssl rand -hex 32`)');

export const envSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'production', 'test'])
      .default('development'),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    HOST: z.string().min(1).default('0.0.0.0'),
    PORT: z.coerce.number().int().min(0).max(65535).default(3000),
    DATABASE_URL: z.url({
      protocol: /^postgres(ql)?$/,
      error: 'must be a postgres:// or postgresql:// URL',
    }),
    JWT_ACCESS_SECRET: secret,
    JWT_REFRESH_SECRET: secret,
  })
  .refine((env) => env.JWT_ACCESS_SECRET !== env.JWT_REFRESH_SECRET, {
    path: ['JWT_REFRESH_SECRET'],
    message: 'must differ from JWT_ACCESS_SECRET',
  });

export type Env = z.infer<typeof envSchema>;

export class ConfigError extends Error {
  override name = 'ConfigError';
}

/** Validates the environment once at startup. Throws a ConfigError naming every invalid variable. */
export function loadEnv(
  source: Record<string, string | undefined> = process.env,
): Env {
  // A blank value (e.g. `PORT=` in .env) means "use the default", not "empty".
  const present = Object.fromEntries(
    Object.entries(source).filter(([, value]) => value?.trim()),
  );
  const result = envSchema.safeParse(present);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new ConfigError(`Invalid environment configuration:\n${problems}`);
  }
  return result.data;
}
