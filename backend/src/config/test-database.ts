import { z } from 'zod';
import { ConfigError } from './env';

const urlSchema = z.url({
  protocol: /^postgres(ql)?$/,
  error: 'must be a postgres:// or postgresql:// URL',
});

/**
 * The Postgres server the tests use instead of starting their own container.
 * Returns undefined when TEST_DATABASE_URL is unset or blank. The tests
 * create and drop their own databases on it, so its role needs CREATEDB.
 */
export function loadTestDatabaseUrl(
  source: Record<string, string | undefined> = process.env,
): string | undefined {
  const value = source.TEST_DATABASE_URL?.trim();
  if (!value) return undefined;
  const result = urlSchema.safeParse(value);
  if (!result.success) {
    throw new ConfigError(
      `Invalid TEST_DATABASE_URL: ${result.error.issues[0]?.message}`,
    );
  }
  return result.data;
}
