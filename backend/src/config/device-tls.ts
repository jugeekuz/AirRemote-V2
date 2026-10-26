import { readFile } from 'node:fs/promises';
import { ConfigError, type Env } from './env';

/** PEM material for the device listener's mutual TLS. */
export type DeviceTls = { cert: Buffer; key: Buffer; ca: Buffer };

const files = {
  cert: 'DEVICE_TLS_CERT_FILE',
  key: 'DEVICE_TLS_KEY_FILE',
  ca: 'DEVICE_TLS_CA_FILE',
} as const;

/**
 * Reads the device listener's certificate, key and CA once at startup.
 * Returns null when they are not configured (the device listener stays off).
 * Throws a ConfigError naming every file that cannot be read.
 */
export async function loadDeviceTls(env: Env): Promise<DeviceTls | null> {
  // loadEnv guarantees all three are set or none is.
  if (env.DEVICE_TLS_CERT_FILE === undefined) return null;

  const entries = Object.entries(files) as [keyof DeviceTls, keyof Env][];
  const results = await Promise.all(
    entries.map(async ([key, variable]) => {
      const path = String(env[variable]);
      try {
        return { key, contents: await readFile(path) };
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code ?? 'unknown error';
        return {
          key,
          problem: `  - ${variable}: cannot read ${path} (${code})`,
        };
      }
    }),
  );

  const problems = results.flatMap((r) => ('problem' in r ? [r.problem] : []));
  if (problems.length > 0) {
    throw new ConfigError(
      `Invalid environment configuration:\n${problems.join('\n')}`,
    );
  }
  return Object.fromEntries(
    results.map((r) => [r.key, 'contents' in r ? r.contents : undefined]),
  ) as DeviceTls;
}
