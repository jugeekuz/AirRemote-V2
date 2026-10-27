import type { PairingCodeResponse } from '@airremote/contracts';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildTestApp } from '../../../__tests__/test-utils';
import { AppError } from '../../../shared/errors';
import { devicesDeviceRoutes } from '../devices.device-routes';
import type { DevicesService } from '../devices.service';

const issued: PairingCodeResponse = {
  pairingCode: '7K4MQ9TX',
  expiresAt: '2026-10-26T12:15:00.000Z',
};

let app: FastifyInstance;
let received: (string | null)[];

async function appWith(issuePairingCode: DevicesService['issuePairingCode']) {
  received = [];
  app = await buildTestApp();
  // `inject` has no TLS socket; give it the certificate a device would present.
  app.addHook('onRequest', async (request) => {
    Object.assign(request.raw.socket, {
      getPeerCertificate: () => ({ subject: { CN: 'AA:BB:CC:DD:EE:01' } }),
    });
  });
  await app.register(devicesDeviceRoutes, {
    service: {
      authorizeConnection: async () => null,
      enroll: async () => {
        throw new Error('not expected');
      },
      list: async () => {
        throw new Error('not expected');
      },
      recordFirmwareVersion: async () => {
        throw new Error('not expected');
      },
      issuePairingCode: async (commonName) => {
        received.push(commonName);
        return issuePairingCode(commonName);
      },
    },
  });
  return app;
}

afterEach(async () => {
  await app?.close();
});

describe('POST /pairing-code', () => {
  it('returns 201 with the code issued for the certificate CN', async () => {
    await appWith(async () => issued);
    const res = await app.inject({ method: 'POST', url: '/pairing-code' });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual(issued);
    expect(received).toEqual(['AA:BB:CC:DD:EE:01']);
  });

  it.each([
    new AppError(
      403,
      'INVALID_DEVICE_CERTIFICATE',
      'Client certificate does not identify a device',
    ),
    new AppError(
      409,
      'DEVICE_ALREADY_REGISTERED',
      'Device is already registered',
    ),
  ])('passes the service error $code through', async (error) => {
    await appWith(async () => {
      throw error;
    });
    const res = await app.inject({ method: 'POST', url: '/pairing-code' });
    expect(res.statusCode).toBe(error.statusCode);
    expect(res.json()).toEqual({
      error: { code: error.code, message: error.message },
    });
  });
});
