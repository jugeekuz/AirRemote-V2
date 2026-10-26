import { createDb } from '@airremote/db';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './app';
import { loadDeviceTls, type DeviceTls } from './config/device-tls';
import { ConfigError, loadEnv, type Env } from './config/env';
import { buildDeviceServer } from './device-server';
import { createDeviceConnections } from './shared/device-connections';

async function readConfig(): Promise<{ env: Env; tls: DeviceTls | null }> {
  try {
    const env = loadEnv();
    return { env, tls: await loadDeviceTls(env) };
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  }
}

const { env, tls } = await readConfig();

// One pool and one registry, shared by the API and the device server.
const db = createDb(env.DATABASE_URL);
const connections = createDeviceConnections();

const app = await buildApp({ env, db });
const deviceServer: FastifyInstance | null = tls
  ? await buildDeviceServer({ env, tls, db, connections })
  : null;

if (!deviceServer) {
  app.log.warn(
    'Device server is off: set DEVICE_TLS_CERT_FILE, DEVICE_TLS_KEY_FILE and DEVICE_TLS_CA_FILE to enable it',
  );
}

async function shutdown() {
  await Promise.allSettled([app.close(), deviceServer?.close()]);
  await db.close();
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, async () => {
    app.log.info(`Received ${signal}, shutting down`);
    await shutdown();
    process.exit(0);
  });
}

try {
  await app.listen({ host: env.HOST, port: env.PORT });
  await deviceServer?.listen({ host: env.HOST, port: env.DEVICE_PORT });
} catch (error) {
  app.log.error(error);
  await shutdown();
  process.exit(1);
}
