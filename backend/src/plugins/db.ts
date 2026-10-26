import type { Database, DbHandle } from '@airremote/db';
import fp from 'fastify-plugin';

declare module 'fastify' {
  interface FastifyInstance {
    db: Database;
  }
}

export const dbPlugin = fp<{
  handle: DbHandle;
  /** Whether closing the app closes the handle (false when the caller owns it). */
  close: boolean;
}>(async (app, { handle, close }) => {
  app.decorate('db', handle.db);
  if (close) {
    app.addHook('onClose', async () => {
      await handle.close();
    });
  }
});
