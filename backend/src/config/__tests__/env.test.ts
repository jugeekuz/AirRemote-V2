import { describe, expect, it } from 'vitest';
import { ConfigError, loadEnv, type Env } from '../env';

const valid = {
  DATABASE_URL: 'postgres://u:p@localhost:5432/db',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'r'.repeat(32),
};

function expectNoDeviceTls(env: Env) {
  expect(env.DEVICE_TLS_CERT_FILE).toBeUndefined();
  expect(env.DEVICE_TLS_KEY_FILE).toBeUndefined();
  expect(env.DEVICE_TLS_CA_FILE).toBeUndefined();
}

describe('loadEnv', () => {
  it('applies defaults', () => {
    expect(loadEnv(valid)).toEqual({
      ...valid,
      NODE_ENV: 'development',
      LOG_LEVEL: 'info',
      HOST: '0.0.0.0',
      PORT: 3000,
      DEVICE_PORT: 8443,
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

  it('requires both JWT secrets', () => {
    expect(() => loadEnv({ DATABASE_URL: valid.DATABASE_URL })).toThrow(
      /(?=[\s\S]*JWT_ACCESS_SECRET)(?=[\s\S]*JWT_REFRESH_SECRET)/,
    );
  });

  it('rejects a JWT secret shorter than 32 characters', () => {
    expect(() => loadEnv({ ...valid, JWT_ACCESS_SECRET: 'too-short' })).toThrow(
      /JWT_ACCESS_SECRET/,
    );
  });

  it('rejects using the same secret for both token types', () => {
    expect(() =>
      loadEnv({ ...valid, JWT_REFRESH_SECRET: valid.JWT_ACCESS_SECRET }),
    ).toThrow(/JWT_REFRESH_SECRET/);
  });

  it('defaults DEVICE_PORT to 8443', () => {
    expect(loadEnv(valid).DEVICE_PORT).toBe(8443);
  });

  it('accepts all three DEVICE_TLS_* files or none', () => {
    const files = {
      DEVICE_TLS_CERT_FILE: '/certs/device-server.crt',
      DEVICE_TLS_KEY_FILE: '/certs/device-server.key',
      DEVICE_TLS_CA_FILE: '/certs/device-ca.crt',
    };
    expect(loadEnv({ ...valid, ...files })).toMatchObject(files);
    expectNoDeviceTls(loadEnv(valid));
  });

  it('rejects a partial DEVICE_TLS_* set, naming each missing variable', () => {
    const load = () =>
      loadEnv({ ...valid, DEVICE_TLS_CERT_FILE: '/certs/device-server.crt' });
    expect(load).toThrow(ConfigError);
    expect(load).toThrow(
      /(?=[\s\S]*DEVICE_TLS_KEY_FILE: must be set together with)(?=[\s\S]*DEVICE_TLS_CA_FILE: must be set together with)/,
    );
  });

  it('treats blank DEVICE_TLS_* values as unset', () => {
    expectNoDeviceTls(
      loadEnv({
        ...valid,
        DEVICE_TLS_CERT_FILE: '',
        DEVICE_TLS_KEY_FILE: ' ',
        DEVICE_TLS_CA_FILE: '',
      }),
    );
  });
});
