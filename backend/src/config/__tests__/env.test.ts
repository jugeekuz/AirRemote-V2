import { describe, expect, it } from 'vitest';
import { ConfigError, loadEnv } from '../env';

const valid = { DATABASE_URL: 'postgres://u:p@localhost:5432/db' };

describe('loadEnv', () => {
  it('applies defaults', () => {
    expect(loadEnv(valid)).toEqual({
      ...valid,
      NODE_ENV: 'development',
      LOG_LEVEL: 'info',
      HOST: '0.0.0.0',
      PORT: 3000,
    });
  });

  it('coerces PORT from a string', () => {
    expect(loadEnv({ ...valid, PORT: '8080' }).PORT).toBe(8080);
  });

  it('treats blank values as unset', () => {
    expect(loadEnv({ ...valid, PORT: '', HOST: ' ' })).toMatchObject({
      PORT: 3000,
      HOST: '0.0.0.0',
    });
  });

  it('rejects a missing DATABASE_URL', () => {
    expect(() => loadEnv({})).toThrow(ConfigError);
    expect(() => loadEnv({})).toThrow(/DATABASE_URL/);
  });

  it('rejects a non-postgres DATABASE_URL', () => {
    expect(() => loadEnv({ DATABASE_URL: 'mysql://u:p@h/db' })).toThrow(
      /DATABASE_URL/,
    );
  });

  it('rejects a non-numeric PORT', () => {
    expect(() => loadEnv({ ...valid, PORT: 'abc' })).toThrow(/PORT/);
  });

  it('names every invalid variable at once', () => {
    expect(() => loadEnv({ PORT: 'abc', LOG_LEVEL: 'loud' })).toThrow(
      /(?=[\s\S]*DATABASE_URL)(?=[\s\S]*PORT)(?=[\s\S]*LOG_LEVEL)/,
    );
  });
});
