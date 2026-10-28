// `pnpm dev`: starts Postgres, applies pending migrations, then runs the API in
// watch mode and the app's dev server (the web app on http://localhost:8081,
// which installed development builds connect to as well). `pnpm dev
// --api-only` leaves the app out. Stopping it (Ctrl+C or SIGTERM), or either
// server exiting, stops both, then Postgres.
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

const root = new URL('..', import.meta.url).pathname;
const webOrigin = 'http://localhost:8081';
const apiOnly = process.argv.includes('--api-only');

const running = new Set<ChildProcess>();
let stopping = false;

function run(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
): Promise<number> {
  return new Promise((resolve, reject) => {
    // Its own process group, so a signal reaches pnpm and everything it starts.
    const child = spawn(command, args, {
      cwd: root,
      env,
      stdio: ['ignore', 'inherit', 'inherit'],
      detached: true,
    });
    running.add(child);
    child.on('error', reject);
    child.on('exit', (code, signal) => {
      running.delete(child);
      resolve(code ?? (signal ? 1 : 0));
    });
  });
}

function stop(signal: NodeJS.Signals): void {
  if (stopping) return;
  stopping = true;
  for (const child of running) if (child.pid) process.kill(-child.pid, signal);
}

process.on('SIGINT', stop);
process.on('SIGTERM', stop);

// The web app calls the API from another origin, so the API must allow it.
// Adds it to CORS_ORIGINS (from the shell or the root .env) when missing.
function apiEnv(): NodeJS.ProcessEnv {
  if (apiOnly) return process.env;
  const envFile = new URL('.env', `file://${root}`);
  const configured =
    process.env.CORS_ORIGINS ??
    (existsSync(envFile)
      ? parseEnv(readFileSync(envFile, 'utf8')).CORS_ORIGINS
      : undefined) ??
    '';
  const origins = configured
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (origins.includes(webOrigin)) return process.env;
  return { ...process.env, CORS_ORIGINS: [...origins, webOrigin].join(',') };
}

async function main(): Promise<number> {
  try {
    if (await run('docker', ['compose', 'up', '-d', '--wait', 'db'])) return 1;
    if (stopping) return 0;
    if (await run('pnpm', ['db:migrate'])) return 1;
    if (stopping) return 0;
    const servers = [
      run('pnpm', ['--filter', '@airremote/backend', 'dev'], apiEnv()),
    ];
    if (!apiOnly)
      servers.push(run('pnpm', ['--filter', '@airremote/frontend', 'web']));
    const code = await Promise.race(servers);
    const stoppedByUser = stopping;
    stop('SIGTERM');
    await Promise.all(servers);
    return stoppedByUser ? 0 : code;
  } finally {
    console.log('\nStopping Postgres…');
    await run('docker', ['compose', 'stop', 'db']);
  }
}

process.exitCode = await main();
