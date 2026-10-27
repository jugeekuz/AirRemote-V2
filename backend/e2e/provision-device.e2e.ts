import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const run = promisify(execFile);
const repo = resolve(import.meta.dirname, '../..');
const firmware = join(repo, 'firmware');
const script = join(repo, 'scripts/provision-device.sh');
const fakeBoard = join(import.meta.dirname, 'support/fake-board-idf.sh');
const idf = join(firmware, 'scripts/idf.sh');

const IDENTITY_SIZE = 0x3000;
const MAC = 'aa:bb:cc:dd:ee:07';
const RECORD = 'devices/AA-BB-CC-DD-EE-07';
// Docker runs several times per provisioning.
const TIMEOUT_MS = 120_000;

let caDir: string;
let boardDir: string;
let flash: string;

beforeEach(async () => {
  caDir = await mkdtemp(join(tmpdir(), 'airremote-provision-'));
  await run('bash', [join(repo, 'scripts/dev-certs.sh'), '--out', caDir]);
  // Under firmware/, so the real NVS parser can read it in the container.
  await mkdir(join(firmware, 'build'), { recursive: true });
  boardDir = await mkdtemp(join(firmware, 'build', 'fake-board-'));
  flash = join(boardDir, 'identity.bin');
  await writeFile(flash, Buffer.alloc(IDENTITY_SIZE, 0xff));
});

afterEach(async () => {
  await rm(caDir, { recursive: true, force: true });
  await rm(boardDir, { recursive: true, force: true });
});

type Result = { code: number; stdout: string; stderr: string };

/** Runs the script against the fake board; never throws on a non-zero exit. */
async function provision(
  args: string[] = [],
  env: Record<string, string> = {},
): Promise<Result> {
  try {
    const { stdout, stderr } = await run(
      'bash',
      [script, '--ca-dir', caDir, ...args],
      {
        env: {
          ...process.env,
          PROVISION_IDF_SH: fakeBoard,
          FAKE_FLASH: flash,
          FAKE_MAC: MAC,
          ...env,
        },
      },
    );
    return { code: 0, stdout, stderr };
  } catch (error) {
    const { code, stdout, stderr } = error as Result;
    return { code, stdout, stderr };
  }
}

type NvsEntry = {
  namespace: string;
  key: string;
  encoding: string;
  data: string;
};

/** The board's identity entries, parsed by ESP-IDF's own NVS tool. */
async function parseIdentity(): Promise<NvsEntry[]> {
  const path = relative(firmware, flash);
  const { stdout } = await run(
    idf,
    [
      'exec',
      'bash',
      '-c',
      `python "$IDF_PATH/components/nvs_flash/nvs_partition_tool/nvs_tool.py" -f json -d minimal ${path}`,
    ],
    { env: { ...process.env, ESPPORT: '/nonexistent' } },
  );
  return JSON.parse(stdout.slice(stdout.indexOf('['))) as NvsEntry[];
}

async function openssl(args: string[], input?: string) {
  const child = run('openssl', args);
  if (input !== undefined) {
    child.child.stdin!.end(input);
  }
  return (await child).stdout.trim();
}

const pem = async (name: string) => {
  const path = join(caDir, name);
  return { path, text: await readFile(path, 'utf8') };
};

async function exists(path: string) {
  return readFile(path).then(
    () => true,
    () => false,
  );
}

async function provisionFolders() {
  return (await readdir(join(firmware, 'build'))).filter((name) =>
    name.startsWith('provision-'),
  );
}

describe('scripts/provision-device.sh', () => {
  it(
    'provisions a blank board',
    async () => {
      const result = await provision();
      expect(result).toMatchObject({ code: 0 });

      const entries = await parseIdentity();
      expect(
        entries.map(({ namespace, key, encoding }) => ({
          namespace,
          key,
          encoding,
        })),
      ).toEqual([
        { namespace: 'identity', key: 'cert', encoding: 'string' },
        { namespace: 'identity', key: 'key', encoding: 'string' },
      ]);
      const cert = entries.find((entry) => entry.key === 'cert')!.data;
      const key = entries.find((entry) => entry.key === 'key')!.data;

      const record = await pem(`${RECORD}.crt`);
      expect(record.text).toBe(cert);
      expect(
        await openssl([
          'verify',
          '-CAfile',
          join(caDir, 'device-ca.crt'),
          record.path,
        ]),
      ).toMatch(/: OK$/);
      expect(
        await openssl([
          'x509',
          '-noout',
          '-subject',
          '-nameopt',
          'RFC2253',
          '-in',
          record.path,
        ]),
      ).toBe('subject=CN=AA:BB:CC:DD:EE:07');
      expect(await openssl(['pkey', '-pubout'], key)).toBe(
        await openssl(['x509', '-pubkey', '-noout', '-in', record.path]),
      );

      expect(await exists(join(caDir, `${RECORD}.key`))).toBe(false);
      expect(await provisionFolders()).toEqual([]);

      const fingerprint = await openssl([
        'x509',
        '-noout',
        '-fingerprint',
        '-sha256',
        '-in',
        record.path,
      ]);
      expect(result.stdout).toContain('AA:BB:CC:DD:EE:07');
      expect(result.stdout).toContain(fingerprint.split('=')[1]!);
    },
    TIMEOUT_MS,
  );

  it(
    'provisions a board with leftovers from older firmware without --force',
    async () => {
      await writeFile(flash, randomBytes(IDENTITY_SIZE));

      expect(await provision()).toMatchObject({ code: 0 });

      expect((await parseIdentity()).map((entry) => entry.key)).toEqual([
        'cert',
        'key',
      ]);
    },
    TIMEOUT_MS,
  );

  it(
    'refuses a board that already has an identity',
    async () => {
      await provision();
      const record = await pem(`${RECORD}.crt`);
      const flashBefore = await readFile(flash);
      const fingerprint = (
        await openssl([
          'x509',
          '-noout',
          '-fingerprint',
          '-sha256',
          '-in',
          record.path,
        ])
      ).split('=')[1]!;

      const result = await provision();

      expect(result.code).toBe(1);
      expect(result.stderr).toContain('the board already has an identity');
      expect(result.stderr).toContain(fingerprint);
      expect(result.stderr).toContain('not revoked');
      expect(await readFile(flash)).toEqual(flashBefore);
      expect((await pem(`${RECORD}.crt`)).text).toBe(record.text);
      expect(await exists(join(caDir, `${RECORD}.key`))).toBe(false);
      expect(await provisionFolders()).toEqual([]);
    },
    TIMEOUT_MS,
  );

  it(
    'replaces it with --force',
    async () => {
      await provision();
      const first = (await parseIdentity()).find((e) => e.key === 'cert')!.data;

      expect(await provision(['--force'])).toMatchObject({ code: 0 });

      const second = (await parseIdentity()).find(
        (e) => e.key === 'cert',
      )!.data;
      expect(second).not.toBe(first);
      expect((await pem(`${RECORD}.crt`)).text).toBe(second);
      expect(await exists(join(caDir, `${RECORD}.key`))).toBe(false);
    },
    TIMEOUT_MS,
  );

  it(
    'fails when the read-back differs, leaving no key or certificate',
    async () => {
      const result = await provision([], { FAKE_CORRUPT_READBACK: '1' });

      expect(result.code).toBe(1);
      expect(result.stderr).toContain('could not be confirmed');
      expect(await exists(join(caDir, `${RECORD}.key`))).toBe(false);
      expect(await exists(join(caDir, `${RECORD}.crt`))).toBe(false);
      expect(await provisionFolders()).toEqual([]);
    },
    TIMEOUT_MS,
  );

  it(
    'with --force, a failed run keeps the previous certificate record',
    async () => {
      await provision();
      const before = await readFile(join(caDir, `${RECORD}.crt`));

      const result = await provision(['--force'], {
        FAKE_CORRUPT_READBACK: '1',
      });

      expect(result.code).toBe(1);
      expect(await readFile(join(caDir, `${RECORD}.crt`))).toEqual(before);
      expect(await exists(join(caDir, `${RECORD}.key`))).toBe(false);
    },
    TIMEOUT_MS,
  );

  it('says to create the CA when it is missing', async () => {
    const empty = await mkdtemp(join(tmpdir(), 'airremote-no-ca-'));
    try {
      const result = await provision(['--ca-dir', empty]);
      expect(result.code).toBe(1);
      expect(result.stderr).toContain('run scripts/dev-certs.sh first');
    } finally {
      await rm(empty, { recursive: true, force: true });
    }
  });

  it('says when the board is not connected', async () => {
    const env = { ...process.env, ESPPORT: '/nonexistent/ttyUSB9' };
    delete env.PROVISION_IDF_SH;
    const result = await run('bash', [script, '--ca-dir', caDir], { env }).then(
      () => ({ code: 0, stderr: '' }),
      (error: Result) => error,
    );
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('no board on /nonexistent/ttyUSB9');
  });
});
