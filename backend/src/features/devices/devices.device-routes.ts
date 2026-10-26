import { pairingCodeResponseSchema } from '@airremote/contracts';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { peerCommonName } from '../../shared/device-certificate';
import type { DevicesService } from './devices.service';

/** Routes served on the device listener, to devices identified by their certificate. */
export const devicesDeviceRoutes: FastifyPluginAsyncZod<{
  service: DevicesService;
}> = async (app, { service }) => {
  app.post(
    '/pairing-code',
    { schema: { response: { 201: pairingCodeResponseSchema } } },
    async (request, reply) => {
      const commonName = peerCommonName(request);
      const issued = await service.issuePairingCode(commonName);
      request.log.info(
        { macAddress: commonName?.toLowerCase() },
        'Pairing code issued',
      );
      return reply.code(201).send(issued);
    },
  );
};
