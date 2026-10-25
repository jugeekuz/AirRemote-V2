import { healthResponseSchema } from '@airremote/contracts';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { createHealthRepository } from './health.repository';
import { createHealthService } from './health.service';

export const healthRoutes: FastifyPluginAsyncZod = async (app) => {
  const service = createHealthService({
    repository: createHealthRepository(app.db),
  });

  app.get(
    '/health',
    {
      schema: {
        response: { 200: healthResponseSchema, 503: healthResponseSchema },
      },
    },
    async (_request, reply) => {
      const result = await service.check();
      return reply.code(result.status === 'ok' ? 200 : 503).send(result);
    },
  );
};
