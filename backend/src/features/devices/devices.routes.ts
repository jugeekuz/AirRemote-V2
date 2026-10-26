import {
  deviceResponseSchema,
  enrollDeviceRequestSchema,
} from '@airremote/contracts';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { Env } from '../../config/env';
import { authenticatedUserId } from '../../plugins/authenticate';
import { createDevicesRepository } from './devices.repository';
import { createDevicesService, type DevicesService } from './devices.service';

export const devicesRoutes: FastifyPluginAsyncZod<{
  env: Env;
  /** Overrides the service, e.g. with a fake in tests. */
  service?: DevicesService;
}> = async (app, { env, service: override }) => {
  const service =
    override ??
    createDevicesService({
      repository: createDevicesRepository(app.db),
      pairingCodeSecret: env.PAIRING_CODE_SECRET,
    });

  app.post(
    '/',
    {
      preHandler: app.authenticate,
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
