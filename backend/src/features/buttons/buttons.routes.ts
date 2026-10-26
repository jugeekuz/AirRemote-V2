import {
  deviceCommandResponseSchema,
  learnButtonRequestSchema,
} from '@airremote/contracts';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { authenticatedUserId } from '../../plugins/authenticate';
import type { DeviceConnections } from '../../shared/device-connections';
import { createDeviceCommandsRepository } from '../device-commands/device-commands.repository';
import { createDeviceCommandsService } from '../device-commands/device-commands.service';
import { createButtonsRepository } from './buttons.repository';
import { createButtonsService, type ButtonsService } from './buttons.service';

export const buttonsRoutes: FastifyPluginAsyncZod<{
  /** The connected devices, shared with the device server. */
  connections: DeviceConnections;
  /** Overrides the service, e.g. with a fake in tests. */
  service?: ButtonsService;
}> = async (app, { connections, service: override }) => {
  const service =
    override ??
    createButtonsService({
      repository: createButtonsRepository(app.db),
      deviceCommands: createDeviceCommandsService({
        repository: createDeviceCommandsRepository(app.db),
        connections,
      }),
    });

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
};
