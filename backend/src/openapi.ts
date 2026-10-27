// `pnpm openapi`: writes the API's OpenAPI document to `openapi.json` at the
// repository root, e.g. to import into Postman. Builds the app without
// connecting to a database or reading the environment.
import type { Database } from '@airremote/db';
import { writeFile } from 'node:fs/promises';
import { buildApp } from './app';
import type { Env } from './config/env';

// Placeholders: the routes only need them to be built, never to run.
const env: Env = {
  NODE_ENV: 'development',
  LOG_LEVEL: 'silent',
  HOST: '127.0.0.1',
  PORT: 0,
  DATABASE_URL: 'postgres://openapi:openapi@127.0.0.1:5432/openapi',
  JWT_ACCESS_SECRET: 'openapi-access-secret-0123456789abcdef',
  JWT_REFRESH_SECRET: 'openapi-refresh-secret-0123456789abcdef',
  PAIRING_CODE_SECRET: 'openapi-pairing-secret-0123456789abcdef',
  DEVICE_PORT: 0,
};

const app = await buildApp({
  env,
  db: { db: {} as Database, close: async () => {} },
});
await app.ready();

const file = new URL('../../openapi.json', import.meta.url);
await writeFile(file, `${JSON.stringify(app.swagger(), null, 2)}\n`);
await app.close();

console.log(`Wrote ${file.pathname}`);
