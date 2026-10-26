import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { testEnv } from '../../__tests__/test-utils';
import { loadDeviceTls } from '../device-tls';
import { ConfigError } from '../env';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'device-tls-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('loadDeviceTls', () => {
  it('returns null when no DEVICE_TLS_* file is set', async () => {
    expect(await loadDeviceTls(testEnv)).toBeNull();
  });

  it('reads the three files', async () => {
    const paths = {
      DEVICE_TLS_CERT_FILE: join(dir, 'server.crt'),
      DEVICE_TLS_KEY_FILE: join(dir, 'server.key'),
      DEVICE_TLS_CA_FILE: join(dir, 'ca.crt'),
    };
    await writeFile(paths.DEVICE_TLS_CERT_FILE, 'cert-pem');
    await writeFile(paths.DEVICE_TLS_KEY_FILE, 'key-pem');
    await writeFile(paths.DEVICE_TLS_CA_FILE, 'ca-pem');

    const tls = await loadDeviceTls({ ...testEnv, ...paths });

    expect(tls?.cert.toString()).toBe('cert-pem');
    expect(tls?.key.toString()).toBe('key-pem');
    expect(tls?.ca.toString()).toBe('ca-pem');
  });

  it('throws a ConfigError naming every unreadable file', async () => {
    const certFile = join(dir, 'server.crt');
    await writeFile(certFile, 'cert-pem');
    const keyFile = join(dir, 'missing.key');
    const caFile = join(dir, 'missing-ca.crt');

    const load = loadDeviceTls({
      ...testEnv,
      DEVICE_TLS_CERT_FILE: certFile,
      DEVICE_TLS_KEY_FILE: keyFile,
      DEVICE_TLS_CA_FILE: caFile,
    });

    await expect(load).rejects.toBeInstanceOf(ConfigError);
    await expect(load).rejects.toThrow(
      `  - DEVICE_TLS_KEY_FILE: cannot read ${keyFile} (ENOENT)`,
    );
    await expect(load).rejects.toThrow(
      `  - DEVICE_TLS_CA_FILE: cannot read ${caFile} (ENOENT)`,
    );
    await expect(load).rejects.not.toThrow('DEVICE_TLS_CERT_FILE');
  });
});
