import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { certificateFileName, loadIdentity } from '../identity';

const mac = 'AA:BB:CC:DD:EE:01';
let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'device-sim-identity-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function writeCa() {
  await writeFile(join(dir, 'device-ca.crt'), 'CA');
}

async function writeDevice() {
  await mkdir(join(dir, 'devices'));
  await writeFile(join(dir, 'devices', 'AA-BB-CC-DD-EE-01.crt'), 'CERT');
  await writeFile(join(dir, 'devices', 'AA-BB-CC-DD-EE-01.key'), 'KEY');
}

describe('certificateFileName', () => {
  it('replaces the colons with dashes', () => {
    expect(certificateFileName(mac)).toBe('AA-BB-CC-DD-EE-01');
  });
});

describe('loadIdentity', () => {
  it('reads the CA and the device certificate and key', async () => {
    await writeCa();
    await writeDevice();
    expect(await loadIdentity(mac, dir)).toEqual({
      ok: true,
      identity: { ca: 'CA', cert: 'CERT', key: 'KEY' },
    });
  });

  it('names the command that creates a missing CA', async () => {
    await writeDevice();
    const result = await loadIdentity(mac, dir);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain('scripts/dev-certs.sh');
  });

  it('names the command that issues a missing device certificate', async () => {
    await writeCa();
    const result = await loadIdentity(mac, dir);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain(
        'scripts/dev-certs.sh device AA:BB:CC:DD:EE:01',
      );
    }
  });
});
