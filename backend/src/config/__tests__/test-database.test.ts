import { describe, expect, it } from 'vitest';
import { ConfigError } from '../env';
import { loadTestDatabaseUrl } from '../test-database';

describe('loadTestDatabaseUrl', () => {
  it('returns undefined when TEST_DATABASE_URL is unset', () => {
    expect(loadTestDatabaseUrl({})).toBeUndefined();
  });

  it('treats a blank value as unset', () => {
    expect(loadTestDatabaseUrl({ TEST_DATABASE_URL: ' ' })).toBeUndefined();
  });

  it('returns a postgres URL', () => {
    const url = 'postgres://u:p@localhost:5432/postgres';
    expect(loadTestDatabaseUrl({ TEST_DATABASE_URL: url })).toBe(url);
  });

  it('accepts postgresql://', () => {
    const url = 'postgresql://u:p@db/postgres';
    expect(loadTestDatabaseUrl({ TEST_DATABASE_URL: url })).toBe(url);
  });

  it('rejects anything else', () => {
    expect(() =>
      loadTestDatabaseUrl({ TEST_DATABASE_URL: 'mysql://u:p@db/x' }),
    ).toThrow(ConfigError);
    expect(() =>
      loadTestDatabaseUrl({ TEST_DATABASE_URL: 'not a url' }),
    ).toThrow(/TEST_DATABASE_URL/);
  });
});
