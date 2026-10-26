import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { buildDeviceServer } from '../src/device-server';
import { createDeviceConnections } from '../src/shared/device-connections';
import { fakeDb, testEnv } from '../src/__tests__/test-utils';
import { fakeDevicesService } from './support/device-server';

const run = promisify(execFile);
const script = resolve(import.meta.dirname, '../../scripts/dev-certs.sh');

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'airremote-dev-certs-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const devCerts = (...args: string[]) =>
  run('bash', [script, '--out', dir, ...args]);

/** Runs a command that should fail; returns its exit code and stderr. */
async function devCertsFailure(...args: string[]) {
  try {
    await devCerts(...args);
  } catch (error) {
    const { code, stderr } = error as { code: number; stderr: string };
    return { code, stderr };
  }
  throw new Error('dev-certs.sh succeeded but should have failed');
}

const file = (name: string) => join(dir, name);

async function verify(certificate: string) {
  const { stdout } = await run('openssl', [
    'verify',
    '-CAfile',
    file('device-ca.crt'),
    certificate,
  ]);
  return stdout.trim();
}

async function fingerprint(certificate: string) {
  const { stdout } = await run('openssl', [
    'x509',
    '-noout',
    '-fingerprint',
    '-sha256',
    '-in',
    certificate,
  ]);
  return stdout.trim();
}

const deviceCert = () => file('devices/AA-BB-CC-DD-EE-01.crt');

describe('scripts/dev-certs.sh', () => {
  it('creates a CA and a server certificate that chains to it', async () => {
    const { stdout } = await devCerts();
    expect(await verify(file('device-server.crt'))).toMatch(/: OK$/);
    expect(stdout).toContain(
      `DEVICE_TLS_CERT_FILE=${file('device-server.crt')}`,
    );
    expect(stdout).toContain(
      `DEVICE_TLS_KEY_FILE=${file('device-server.key')}`,
    );
    expect(stdout).toContain(`DEVICE_TLS_CA_FILE=${file('device-ca.crt')}`);
  });

  it('issues a device certificate with the upper-cased MAC as CN', async () => {
    await devCerts();
    await devCerts('device', 'aa:bb:cc:dd:ee:01');
    expect(await verify(deviceCert())).toMatch(/: OK$/);
    const { stdout } = await run('openssl', [
      'x509',
      '-noout',
      '-subject',
      '-nameopt',
      'RFC2253',
      '-in',
      deviceCert(),
    ]);
    expect(stdout.trim()).toBe('subject=CN=AA:BB:CC:DD:EE:01');
  });

  it('writes keys readable by owner and group only', async () => {
    await devCerts();
    await devCerts('device', 'AA:BB:CC:DD:EE:01');
    for (const key of [
      'device-ca.key',
      'device-server.key',
      'devices/AA-BB-CC-DD-EE-01.key',
    ]) {
      expect((await stat(file(key))).mode & 0o777).toBe(0o640);
    }
  });

  it('keeps the CA when run again', async () => {
    await devCerts();
    await devCerts('device', 'AA:BB:CC:DD:EE:01');
    const before = await fingerprint(file('device-ca.crt'));
    await devCerts();
    expect(await fingerprint(file('device-ca.crt'))).toBe(before);
    expect(await verify(deviceCert())).toMatch(/: OK$/);
  });

  it('replaces the CA and removes device certificates with --force', async () => {
    await devCerts();
    await devCerts('device', 'AA:BB:CC:DD:EE:01');
    const before = await fingerprint(file('device-ca.crt'));
    await devCerts('--force');
    expect(await fingerprint(file('device-ca.crt'))).not.toBe(before);
    await expect(stat(file('devices'))).rejects.toThrow();
  });

  it('refuses a bad MAC', async () => {
    await devCerts();
    const { code, stderr } = await devCertsFailure(
      'device',
      'aa-bb-cc-dd-ee-01',
    );
    expect(code).toBe(1);
    expect(stderr).not.toBe('');
  });

  it('refuses a device before the CA exists', async () => {
    const { code, stderr } = await devCertsFailure(
      'device',
      'AA:BB:CC:DD:EE:01',
    );
    expect(code).toBe(1);
    expect(stderr).not.toBe('');
  });

  it('produces certificates the device server accepts', async () => {
    await devCerts();
    await devCerts('device', 'AA:BB:CC:DD:EE:01');
    const ca = await readFile(file('device-ca.crt'));
    const deviceCertificate = await readFile(deviceCert());
    const deviceKey = await readFile(file('devices/AA-BB-CC-DD-EE-01.key'));
    const server = await buildDeviceServer({
      env: testEnv,
      tls: {
        cert: await readFile(file('device-server.crt')),
        key: await readFile(file('device-server.key')),
        ca,
      },
      db: fakeDb(async () => []),
      connections: createDeviceConnections(),
      service: fakeDevicesService({ authorizeConnection: async () => null }),
    });
    try {
      await server.listen({ host: '127.0.0.1', port: 0 });
      const address = server.server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      const status = await new Promise<number>((resolve, reject) => {
        const socket = new WebSocket(
          `wss://localhost:${port}/ws`,
          ['airremote.v1'],
          { ca, cert: deviceCertificate, key: deviceKey },
        );
        socket.once('unexpected-response', (_request, response) => {
          resolve(response.statusCode ?? 0);
          socket.terminate();
        });
        socket.once('open', () => reject(new Error('upgrade was accepted')));
        socket.once('error', reject);
      });
      expect(status).toBe(403);
    } finally {
      await server.close();
    }
  });
});
