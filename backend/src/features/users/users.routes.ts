import {
  registerUserRequestSchema,
  userResponseSchema,
} from '@airremote/contracts';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { createUsersRepository } from './users.repository';
import { createUsersService, type UsersService } from './users.service';

export const usersRoutes: FastifyPluginAsyncZod<{
  /** Overrides the service, e.g. with a fake in tests. */
  service?: UsersService;
}> = async (app, options) => {
  const service =
    options.service ??
    createUsersService({ repository: createUsersRepository(app.db) });

  app.post(
    '/register',
    {
      schema: {
        body: registerUserRequestSchema,
        response: { 201: userResponseSchema },
      },
    },
    async (request, reply) =>
      reply.code(201).send(await service.register(request.body)),
  );
};
