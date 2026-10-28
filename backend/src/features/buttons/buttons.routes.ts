import {
  buttonListResponseSchema,
  deviceCommandResponseSchema,
  learnButtonRequestSchema,
  noContentResponseSchema,
} from '@airremote/contracts';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { authenticatedUserId } from '../../plugins/authenticate';
import type { DeviceConnections } from '../../shared/device-connections';
import { createDeviceCommandsRepository } from '../device-commands/device-commands.repository';
import {
  createDeviceCommandsService,
  type DeviceCommandTimings,
} from '../device-commands/device-commands.service';
import { createButtonsRepository } from './buttons.repository';
import { createButtonsService, type ButtonsService } from './buttons.service';

export const buttonsRoutes: FastifyPluginAsyncZod<{
  /** The connected devices, shared with the device server. */
  connections: DeviceConnections;
  /** Shortens the device read and the commands' lives, e.g. in tests. */
  timings?: DeviceCommandTimings;
  /** Overrides the service, e.g. with a fake in tests. */
  service?: ButtonsService;
}> = async (app, { connections, timings, service: override }) => {
  const service =
    override ??
    createButtonsService({
      repository: createButtonsRepository(app.db),
      deviceCommands: createDeviceCommandsService({
        repository: createDeviceCommandsRepository(app.db),
        connections,
        ...timings,
      }),
    });

  app.get(
    '/remotes/:remoteId/buttons',
    {
      onRequest: app.authenticate,
      schema: {
        params: z.object({ remoteId: z.uuid() }),
        response: { 200: buttonListResponseSchema },
      },
    },
    async (request) =>
      service.list(authenticatedUserId(request), request.params.remoteId),
  );

  app.post(
    '/remotes/:remoteId/buttons',
    {
      onRequest: app.authenticate,
      schema: {
        params: z.object({ remoteId: z.uuid() }),
        body: learnButtonRequestSchema,
        response: { 202: deviceCommandResponseSchema },
      },
    },
    async (request, reply) => {
      const command = await service.learn(
        authenticatedUserId(request),
        request.params.remoteId,
        request.body,
      );
      return reply
        .code(202)
        .header('location', `/device-commands/${command.id}`)
        .send(command);
    },
  );

  app.post(
    '/buttons/:buttonId/press',
    {
      onRequest: app.authenticate,
      schema: {
        params: z.object({ buttonId: z.uuid() }),
        response: { 202: deviceCommandResponseSchema },
      },
    },
    async (request, reply) => {
      const command = await service.press(
        authenticatedUserId(request),
        request.params.buttonId,
      );
      return reply
        .code(202)
        .header('location', `/device-commands/${command.id}`)
        .send(command);
    },
  );

  app.delete(
    '/buttons/:buttonId',
    {
      onRequest: app.authenticate,
      schema: {
        params: z.object({ buttonId: z.uuid() }),
        response: { 204: noContentResponseSchema },
      },
    },
    async (request, reply) => {
      await service.delete(
        authenticatedUserId(request),
        request.params.buttonId,
      );
      return reply.code(204).send(null);
    },
  );
};
