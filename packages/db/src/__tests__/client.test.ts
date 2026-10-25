import { createServer, type Server, type Socket } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { createDb } from '../client';
import { sql } from 'drizzle-orm';

let server: Server | undefined;
const sockets: Socket[] = [];

afterEach(async () => {
  sockets.forEach((socket) => socket.destroy());
  await new Promise((resolve) => server?.close(resolve));
});

/** A server that accepts connections and never answers, like a hung database. */
async function silentServer(): Promise<number> {
  server = createServer((socket) => {
    sockets.push(socket);
  });
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (typeof address !== 'object' || address === null) throw new Error();
  return address.port;
}

describe('createDb', () => {
  it('closes even when a query is stuck on a database that never answers', async () => {
    const port = await silentServer();
    const handle = createDb(`postgres://u:p@127.0.0.1:${port}/db`, {
      closeTimeoutSeconds: 1,
    });
    const stuck = handle.db.execute(sql`select 1`).catch(() => 'rejected');
    await expect.poll(() => sockets.length).toBeGreaterThan(0);

    const started = Date.now();
    await handle.close();

    expect(Date.now() - started).toBeLessThan(3000);
    expect(await stuck).toBe('rejected');
  }, 10_000);
});
