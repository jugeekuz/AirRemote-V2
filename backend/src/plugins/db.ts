import type { Database, DbHandle } from '@airremote/db';
import fp from 'fastify-plugin';

declare module 'fastify' {
  interface FastifyInstance {
    db: Database;
  }
}

export const dbPlugin = fp<{ handle: DbHandle }>(async (app, { handle }) => {
  app.decorate('db', handle.db);
  app.addHook('onClose', async () => {
    await handle.close();
  });
});
