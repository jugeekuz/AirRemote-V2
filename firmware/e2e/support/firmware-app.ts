import { execFile, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { promisify } from 'node:util';
import { inject } from 'vitest';
import type { TestClientName } from '../../../backend/e2e/support/device-certs.global-setup';

const run = promisify(execFile);
const firmware = resolve(import.meta.dirname, '../..');
const idf = join(firmware, 'scripts/idf.sh');

export type FirmwareApp = {
  /** Every line the app printed so far. */
  readonly lines: string[];
  /** Types a line on its console. */
  type(line: string): void;
  /** Waits for a printed line equal to `text` (or matching it), after `from`. */
  waitForLine(
    text: string | RegExp,
    withinMs?: number,
    from?: number,
  ): Promise<string>;
  /**
   * Makes the stand-in IR receiver see these parts (µs timings), `gapsMs[i]`
   * apart between part i and i + 1 (default 30 ms), once it is listening.
   */
  pressIr(parts: number[][], gapsMs?: number[]): Promise<void>;
  stop(): Promise<void>;
};

export type StartOptions = {
  /** The device listener's base URL, e.g. https://127.0.0.1:41234. */
  backendUrl: string;
  /** Which of the run's client certificates the app presents; null: none. */
  client: TestClientName | null;
  env?: Record<string, string>;
};

const running: FirmwareApp[] = [];

/** Stops every app started by the current test. */
export async function stopAllFirmware() {
  await Promise.all(running.splice(0).map((app) => app.stop()));
}

/**
 * Starts the Linux build of the firmware in the ESP-IDF container, with host
 * networking so it reaches a device listener on 127.0.0.1. Its identity is
 * written to a folder under firmware/build/ and deleted on stop().
 */
export async function startFirmware({
  backendUrl,
  client,
  env = {},
}: StartOptions) {
  const id = randomBytes(4).toString('hex');
  const name = `airremote-e2e-${id}`;
  const folder = join(firmware, 'build', `e2e-${id}`);
  const inContainer = `/project/build/e2e-${id}`;
  await mkdir(folder, { recursive: true });

  const certs = inject('deviceCerts');
  const vars: Record<string, string> = {
    AIRREMOTE_BACKEND_URL: backendUrl,
    AIRREMOTE_CA_FILE: `${inContainer}/ca.pem`,
    AIRREMOTE_MAC: 'AA:BB:CC:DD:EE:01',
    AIRREMOTE_IR_FILE: `${inContainer}/ir.txt`,
    ...env,
  };
  await writeFile(join(folder, 'ca.pem'), certs.ca);
  if (client) {
    await writeFile(join(folder, 'cert.pem'), certs.clients[client].cert);
    await writeFile(join(folder, 'key.pem'), certs.clients[client].key);
    vars.AIRREMOTE_CERT_FILE = `${inContainer}/cert.pem`;
    vars.AIRREMOTE_KEY_FILE = `${inContainer}/key.pem`;
  }
  const dockerArgs = [
    '--network host',
    `--name ${name}`,
    ...Object.entries(vars).map(([key, value]) => `-e ${key}=${value}`),
  ].join(' ');

  const child = spawn(idf, ['exec', 'linux/build/airremote_linux.elf'], {
    env: {
      ...process.env,
      ESPPORT: '/nonexistent',
      IDF_DOCKER_ARGS: dockerArgs,
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const lines: string[] = [];
  let partial = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => {
    const parts = (partial + chunk).split('\n');
    partial = parts.pop() ?? '';
    lines.push(...parts.map((line) => line.replace(/\r$/, '')));
  });
  const errors: string[] = [];
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk: string) => errors.push(chunk));

  const app: FirmwareApp = {
    lines,
    type(line) {
      child.stdin.write(`${line}\n`);
    },
    async waitForLine(text, withinMs = 10_000, from = 0) {
      const deadline = Date.now() + withinMs;
      const matches = (line: string) =>
        typeof text === 'string' ? line === text : text.test(line);
      for (;;) {
        const found = lines.slice(from).find(matches);
        if (found !== undefined) return found;
        if (Date.now() > deadline) {
          throw new Error(
            `firmware never printed ${String(text)}; it printed:\n${lines.join('\n')}` +
              `\nstderr:\n${errors.join('')}\nbackend: ${backendUrl}`,
          );
        }
        await delay(25);
      }
    },
    async pressIr(parts, gapsMs = []) {
      const lines = parts.flatMap((part, i) => [
        ...(i > 0 ? [`gap ${gapsMs[i - 1] ?? 30}`] : []),
        part.join(','),
      ]);
      // Written whole, then renamed, so the app never reads half a file.
      await writeFile(join(folder, 'ir.tmp'), `${lines.join('\n')}\n`);
      await rename(join(folder, 'ir.tmp'), join(folder, 'ir.txt'));
    },
    async stop() {
      child.kill();
      await run('docker', ['rm', '-f', name]).catch(() => undefined);
      await rm(folder, { recursive: true, force: true });
    },
  };
  running.push(app);
  return app;
}
