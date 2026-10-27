import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { firmwareVersionSchema } from '@airremote/contracts';

export type CliOptions = {
  mac: string;
  server: string;
  certsDir: string;
  firmwareVersion: string;
};

const MAC_ADDRESS = /^[0-9a-f]{2}(:[0-9a-f]{2}){5}$/i;
const USAGE =
  'usage: pnpm device-sim --mac AA:BB:CC:DD:EE:FF [--server https://localhost:8443] [--certs ./certs] [--firmware-version 0.0.0-sim]';

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

/** `certs/` at the repository root, wherever the tool is started from. */
const DEFAULT_CERTS_DIR = resolve(import.meta.dirname, '../../../certs');

export function parseCliArgs(
  argv: string[],
): { ok: true; options: CliOptions } | { ok: false; message: string } {
  let values;
  try {
    ({ values } = parseArgs({
      args: argv,
      options: {
        mac: { type: 'string' },
        server: { type: 'string', default: 'https://localhost:8443' },
        certs: { type: 'string', default: DEFAULT_CERTS_DIR },
        'firmware-version': { type: 'string', default: '0.0.0-sim' },
      },
    }));
  } catch (error) {
    return { ok: false, message: `${(error as Error).message}\n${USAGE}` };
  }

  if (!values.mac || !MAC_ADDRESS.test(values.mac)) {
    return { ok: false, message: USAGE };
  }
  if (!isHttpsUrl(values.server)) {
    return {
      ok: false,
      message: `--server must be an https:// URL, e.g. https://localhost:8443\n${USAGE}`,
    };
  }
  if (!firmwareVersionSchema.safeParse(values['firmware-version']).success) {
    return {
      ok: false,
      message: `--firmware-version must look like 1.2.3 or 1.2.3-beta.1\n${USAGE}`,
    };
  }
  return {
    ok: true,
    options: {
      mac: values.mac.toUpperCase(),
      server: values.server,
      certsDir: values.certs,
      firmwareVersion: values['firmware-version'],
    },
  };
}
