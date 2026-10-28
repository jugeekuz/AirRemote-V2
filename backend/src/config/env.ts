import { z } from 'zod';

const secret = z
  .string()
  .min(32, 'must be at least 32 characters (e.g. `openssl rand -hex 32`)');

const deviceTlsVariables = [
  'DEVICE_TLS_CERT_FILE',
  'DEVICE_TLS_KEY_FILE',
  'DEVICE_TLS_CA_FILE',
] as const;

const corsOrigins = z
  .string()
  .default('')
  .transform((value) =>
    value
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  )
  .pipe(
    z.array(
      z.string().refine(isOrigin, {
        error:
          'must be comma-separated origins like http://localhost:8081 (http or https, no path or trailing slash)',
      }),
    ),
  );

function isOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      url.origin === value
    );
  } catch {
    return false;
  }
}

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
    PAIRING_CODE_SECRET: secret,
    DEVICE_PORT: z.coerce.number().int().min(0).max(65535).default(8443),
    DEVICE_TLS_CERT_FILE: z.string().min(1).optional(),
    DEVICE_TLS_KEY_FILE: z.string().min(1).optional(),
    DEVICE_TLS_CA_FILE: z.string().min(1).optional(),
    CORS_ORIGINS: corsOrigins,
  })
  .refine((env) => env.JWT_ACCESS_SECRET !== env.JWT_REFRESH_SECRET, {
    path: ['JWT_REFRESH_SECRET'],
    message: 'must differ from JWT_ACCESS_SECRET',
  })
  .superRefine((env, ctx) => {
    // The device listener is either fully configured or off.
    const set = deviceTlsVariables.filter((name) => env[name] !== undefined);
    if (set.length === 0 || set.length === deviceTlsVariables.length) return;
    for (const name of deviceTlsVariables) {
      if (env[name] !== undefined) continue;
      const others = deviceTlsVariables.filter((other) => other !== name);
      ctx.addIssue({
        code: 'custom',
        path: [name],
        message: `must be set together with ${others.join(' and ')}`,
      });
    }
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
