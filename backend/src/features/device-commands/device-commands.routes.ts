import { deviceCommandResponseSchema } from '@airremote/contracts';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { authenticatedUserId } from '../../plugins/authenticate';
import type { DeviceConnections } from '../../shared/device-connections';
import { createDeviceCommandsRepository } from './device-commands.repository';
import {
  createDeviceCommandsService,
  type DeviceCommandsService,
} from './device-commands.service';

export const deviceCommandsRoutes: FastifyPluginAsyncZod<{
  /** The connected devices, shared with the device server. */
  connections: DeviceConnections;
  /** Overrides the service, e.g. with a fake in tests. */
  service?: DeviceCommandsService;
}> = async (app, { connections, service: override }) => {
  const service =
    override ??
    createDeviceCommandsService({
      repository: createDeviceCommandsRepository(app.db),
      connections,
    });

  app.get(
    '/device-commands/:id',
    {
      onRequest: app.authenticate,
      schema: {
        params: z.object({ id: z.uuid() }),
        response: { 200: deviceCommandResponseSchema },
      },
    },
    async (request) =>
      service.get(authenticatedUserId(request), request.params.id),
  );
};
