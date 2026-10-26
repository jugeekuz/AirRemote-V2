import { resolve } from 'node:path';
import { parseArgs } from 'node:util';

export type CliOptions = { mac: string; server: string; certsDir: string };

const MAC_ADDRESS = /^[0-9a-f]{2}(:[0-9a-f]{2}){5}$/i;
const USAGE =
  'usage: pnpm device-sim --mac AA:BB:CC:DD:EE:FF [--server https://localhost:8443] [--certs ./certs]';

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
      },
    }));
  } catch (error) {
    return { ok: false, message: `${(error as Error).message}\n${USAGE}` };
  }

  if (!values.mac || !MAC_ADDRESS.test(values.mac)) {
    return { ok: false, message: USAGE };
  }
  return {
    ok: true,
    options: {
      mac: values.mac.toUpperCase(),
      server: values.server,
      certsDir: values.certs,
    },
  };
}
