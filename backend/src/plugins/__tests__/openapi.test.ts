import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { buildTestApp, testEnv } from '../../__tests__/test-utils';
import { authenticatePlugin } from '../authenticate';
import { openApiPlugin } from '../openapi';

let app: FastifyInstance;

beforeEach(async () => {
  app = await buildTestApp();
  await app.register(authenticatePlugin, {
    secrets: {
      accessSecret: testEnv.JWT_ACCESS_SECRET,
      refreshSecret: testEnv.JWT_REFRESH_SECRET,
    },
  });
  await app.register(openApiPlugin);
  const routes = app.withTypeProvider<ZodTypeProvider>();
  routes.post(
    '/things/:thingId',
    {
      onRequest: app.authenticate,
      schema: {
        params: z.object({ thingId: z.uuid() }),
        body: z.object({ name: z.string() }),
        response: { 201: z.object({ id: z.uuid() }) },
      },
    },
    async () => ({ id: '' }),
  );
  routes.get('/open', async () => ({ ok: true }));
  await app.ready();
});

afterEach(async () => {
  await app.close();
});

describe('openApiPlugin', () => {
  it('describes routes from their Zod schemas', () => {
    expect(app.swagger()).toMatchObject({
      paths: {
        '/things/{thingId}': {
          post: {
            parameters: [{ in: 'path', name: 'thingId', required: true }],
            requestBody: {
              content: {
                'application/json': {
                  schema: { properties: { name: { type: 'string' } } },
                },
              },
            },
            responses: { 201: expect.anything() },
          },
        },
      },
    });
  });

  it('marks only routes behind authenticate as needing a bearer token', () => {
    const { paths } = app.swagger();

    expect(paths?.['/things/{thingId}']?.post?.security).toEqual([
      { bearerAuth: [] },
    ]);
    expect(paths?.['/open']?.get?.security).toBeUndefined();
  });
});
