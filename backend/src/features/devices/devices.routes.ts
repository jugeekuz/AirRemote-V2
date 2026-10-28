import {
  deviceListResponseSchema,
  deviceResponseSchema,
  enrollDeviceRequestSchema,
} from '@airremote/contracts';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { Env } from '../../config/env';
import { authenticatedUserId } from '../../plugins/authenticate';
import type { DeviceConnections } from '../../shared/device-connections';
import { createDevicesRepository } from './devices.repository';
import { createDevicesService, type DevicesService } from './devices.service';

export const devicesRoutes: FastifyPluginAsyncZod<{
  env: Env;
  connections: DeviceConnections;
  /** Overrides the service, e.g. with a fake in tests. */
  service?: DevicesService;
}> = async (app, { env, connections, service: override }) => {
  const service =
    override ??
    createDevicesService({
      repository: createDevicesRepository(app.db),
      connections,
      pairingCodeSecret: env.PAIRING_CODE_SECRET,
    });

  app.get(
    '/',
    {
      onRequest: app.authenticate,
      schema: { response: { 200: deviceListResponseSchema } },
    },
    async (request) => service.list(authenticatedUserId(request)),
  );

  app.post(
    '/',
    {
      onRequest: app.authenticate,
      schema: {
        body: enrollDeviceRequestSchema,
        response: { 201: deviceResponseSchema },
      },
    },
    async (request, reply) => {
      const userId = authenticatedUserId(request);
      const device = await service.enroll(userId, request.body);
      request.log.info(
        { deviceId: device.id, macAddress: device.macAddress, userId },
        'Device enrolled',
      );
      return reply.code(201).send(device);
    },
  );
};
