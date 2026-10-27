// `pnpm dev`: starts Postgres, applies pending migrations, then runs the API in
// watch mode. Stopping it (Ctrl+C or SIGTERM) stops the API, then Postgres.
import { spawn, type ChildProcess } from 'node:child_process';

const root = new URL('..', import.meta.url).pathname;

let current: ChildProcess | undefined;
let stopping = false;

function run(command: string, args: string[]): Promise<number> {
  return new Promise((resolve, reject) => {
    // Its own process group, so a signal reaches pnpm and everything it starts.
    const child = spawn(command, args, {
      cwd: root,
      stdio: ['ignore', 'inherit', 'inherit'],
      detached: true,
    });
    current = child;
    child.on('error', reject);
    child.on('exit', (code, signal) => {
      current = undefined;
      resolve(code ?? (signal ? 1 : 0));
    });
  });
}

function stop(signal: NodeJS.Signals): void {
  if (stopping) return;
  stopping = true;
  if (current?.pid) process.kill(-current.pid, signal);
}

process.on('SIGINT', stop);
process.on('SIGTERM', stop);

async function main(): Promise<number> {
  try {
    if (await run('docker', ['compose', 'up', '-d', '--wait', 'db'])) return 1;
    if (stopping) return 0;
    if (await run('pnpm', ['db:migrate'])) return 1;
    if (stopping) return 0;
    const code = await run('pnpm', ['--filter', '@airremote/backend', 'dev']);
    return stopping ? 0 : code;
  } finally {
    console.log('\nStopping Postgres…');
    await run('docker', ['compose', 'stop', 'db']);
  }
}

process.exitCode = await main();
