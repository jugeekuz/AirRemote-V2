import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
const firmware = resolve(import.meta.dirname, '..');

/** Builds the Linux app once per run; every test then starts that binary. */
export default async function setup() {
  try {
    await run(resolve(firmware, 'scripts/idf.sh'), ['-C', 'linux', 'build'], {
      env: { ...process.env, ESPPORT: '/nonexistent' },
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (error) {
    const { stdout = '', stderr = '' } = error as {
      stdout?: string;
      stderr?: string;
    };
    const tail = (stdout + stderr).split('\n').slice(-40).join('\n');
    // Printed first: Vitest can fail to format an error thrown from a global
    // setup, which would hide the build output.
    console.error(`building firmware/linux failed:\n${tail}`);
    throw new Error('building firmware/linux failed (see above)', {
      cause: error,
    });
  }
}
