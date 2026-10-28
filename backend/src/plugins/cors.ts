import cors from '@fastify/cors';
import fp from 'fastify-plugin';

export interface CorsOptions {
  /** The browser origins allowed to call the API with credentials. */
  origins: string[];
}

/**
 * Lets the listed browser origins call the API with credentials, so the web
 * app can send the httpOnly refresh cookie. Other origins get no CORS headers.
 */
export const corsPlugin = fp<CorsOptions>(
  async (app, { origins }) => {
    await app.register(cors, {
      origin: origins,
      credentials: true,
      methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
    });
  },
  { name: 'cors' },
);
