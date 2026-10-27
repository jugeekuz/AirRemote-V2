import { execFile } from 'node:child_process';
import { readdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
const build = resolve(import.meta.dirname, '../build');

/**
 * Removes what an interrupted run left behind: the firmware's containers and
 * the test identities (keys included) under firmware/build/e2e-*. Runs before
 * the tests, and again after them.
 */
async function sweep() {
  const { stdout } = await run('docker', [
    'ps',
    '-aq',
    '--filter',
    'name=^airremote-e2e-',
  ]).catch(() => ({ stdout: '' }));
  const ids = stdout.split('\n').filter(Boolean);
  if (ids.length > 0)
    await run('docker', ['rm', '-f', ...ids]).catch(() => undefined);
  const entries = await readdir(build).catch(() => [] as string[]);
  await Promise.all(
    entries
      .filter((name) => name.startsWith('e2e-'))
      .map((name) => rm(join(build, name), { recursive: true, force: true })),
  );
}

export default async function setup() {
  await sweep();
  return sweep;
}
