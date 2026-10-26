import {
  createRemoteRequestSchema,
  remoteListResponseSchema,
  remoteResponseSchema,
} from '@airremote/contracts';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { authenticatedUserId } from '../../plugins/authenticate';
import { createRemotesRepository } from './remotes.repository';
import { createRemotesService, type RemotesService } from './remotes.service';

export const remotesRoutes: FastifyPluginAsyncZod<{
  /** Overrides the service, e.g. with a fake in tests. */
  service?: RemotesService;
}> = async (app, { service: override }) => {
  const service =
    override ??
    createRemotesService({ repository: createRemotesRepository(app.db) });

  app.get(
    '/remotes',
    {
      onRequest: app.authenticate,
      schema: { response: { 200: remoteListResponseSchema } },
    },
    async (request) => service.list(authenticatedUserId(request)),
  );

  app.post(
    '/devices/:deviceId/remotes',
    {
      onRequest: app.authenticate,
      schema: {
        params: z.object({ deviceId: z.uuid() }),
        body: createRemoteRequestSchema,
        response: { 201: remoteResponseSchema },
      },
    },
    async (request, reply) => {
      const remote = await service.create(
        authenticatedUserId(request),
        request.params.deviceId,
        request.body,
      );
      return reply.code(201).send(remote);
    },
  );
};
