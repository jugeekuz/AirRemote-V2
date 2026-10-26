import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/** What the device presents and trusts: PEM contents. */
export type Identity = { ca: string; cert: string; key: string };

/** `AA:BB:CC:DD:EE:01` → `AA-BB-CC-DD-EE-01`, the name dev-certs.sh gives the files. */
export function certificateFileName(mac: string): string {
  return mac.replaceAll(':', '-');
}

async function readIfPresent(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8');
  } catch {
    return null;
  }
}

export async function loadIdentity(
  mac: string,
  certsDir: string,
): Promise<{ ok: true; identity: Identity } | { ok: false; message: string }> {
  const caPath = join(certsDir, 'device-ca.crt');
  const ca = await readIfPresent(caPath);
  if (ca === null) {
    return {
      ok: false,
      message: `No device CA at ${caPath}. Create it with: scripts/dev-certs.sh`,
    };
  }

  const base = join(certsDir, 'devices', certificateFileName(mac));
  const cert = await readIfPresent(`${base}.crt`);
  const key = await readIfPresent(`${base}.key`);
  if (cert === null || key === null) {
    return {
      ok: false,
      message: `No certificate for ${mac} at ${base}.crt/.key. Issue one with: scripts/dev-certs.sh device ${mac}`,
    };
  }
  return { ok: true, identity: { ca, cert, key } };
}
