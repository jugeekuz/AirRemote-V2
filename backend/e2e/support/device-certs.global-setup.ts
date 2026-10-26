import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { TestProject } from 'vitest/node';

export type TestClientName =
  | 'allowed'
  | 'allowedLowerCase'
  | 'unknown'
  | 'notAMac'
  | 'twoCommonNames'
  | 'foreignCa';

export type TestDeviceCertificates = {
  ca: string;
  serverCert: string;
  serverKey: string;
  clients: Record<TestClientName, { cert: string; key: string }>;
};

declare module 'vitest' {
  export interface ProvidedContext {
    /** Throwaway PEM material for the device listener, generated once per run. */
    deviceCerts: TestDeviceCertificates;
  }
}

const run = promisify(execFile);

/**
 * Generates a throwaway device CA, a server certificate for localhost and
 * client certificates for every case the e2e tests need. Nothing is committed;
 * the folder is deleted when the run ends.
 */
export default async function setup(project: TestProject) {
  const dir = await mkdtemp(join(tmpdir(), 'airremote-certs-'));
  // A minimal config, so OpenSSL adds no default extensions (e.g. CA:TRUE).
  const config = join(dir, 'openssl.cnf');
  await writeFile(config, '[req]\ndistinguished_name = dn\n[dn]\n');

  const path = (name: string) => join(dir, name);
  const keyArgs = ['-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1'];

  async function createCa(name: string, subject: string) {
    await run('openssl', [
      'req',
      '-x509',
      '-config',
      config,
      ...keyArgs,
      '-nodes',
      '-days',
      '1',
      '-subj',
      subject,
      '-keyout',
      path(`${name}.key`),
      '-out',
      path(`${name}.crt`),
      '-addext',
      'basicConstraints=critical,CA:TRUE',
      '-addext',
      'keyUsage=critical,keyCertSign,cRLSign',
    ]);
  }

  async function createLeaf(
    name: string,
    subject: string,
    ca: string,
    extensions: string[],
  ) {
    await run('openssl', [
      'req',
      '-x509',
      '-config',
      config,
      ...keyArgs,
      '-nodes',
      '-days',
      '1',
      '-subj',
      subject,
      '-CA',
      path(`${ca}.crt`),
      '-CAkey',
      path(`${ca}.key`),
      '-keyout',
      path(`${name}.key`),
      '-out',
      path(`${name}.crt`),
      '-addext',
      'basicConstraints=critical,CA:FALSE',
      ...extensions.flatMap((extension) => ['-addext', extension]),
    ]);
    return {
      cert: await readFile(path(`${name}.crt`), 'utf8'),
      key: await readFile(path(`${name}.key`), 'utf8'),
    };
  }

  const client = (name: string, subject: string, ca = 'ca') =>
    createLeaf(name, subject, ca, ['extendedKeyUsage=clientAuth']);

  await createCa('ca', '/CN=AirRemote Test Device CA');
  await createCa('foreign-ca', '/CN=Some Other CA');

  const server = await createLeaf('server', '/CN=localhost', 'ca', [
    'subjectAltName=DNS:localhost,IP:127.0.0.1',
    'extendedKeyUsage=serverAuth',
  ]);

  const certificates: TestDeviceCertificates = {
    ca: await readFile(path('ca.crt'), 'utf8'),
    serverCert: server.cert,
    serverKey: server.key,
    clients: {
      allowed: await client('allowed', '/CN=AA:BB:CC:DD:EE:01'),
      allowedLowerCase: await client('lower', '/CN=aa:bb:cc:dd:ee:01'),
      unknown: await client('unknown', '/CN=AA:BB:CC:DD:EE:02'),
      notAMac: await client('not-a-mac', '/CN=device-01'),
      twoCommonNames: await client(
        'two-cns',
        '/CN=AA:BB:CC:DD:EE:01/CN=AA:BB:CC:DD:EE:03',
      ),
      foreignCa: await client('foreign', '/CN=AA:BB:CC:DD:EE:01', 'foreign-ca'),
    },
  };
  project.provide('deviceCerts', certificates);

  return async () => {
    await rm(dir, { recursive: true, force: true });
  };
}
