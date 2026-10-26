import type { DeviceResponse, EnrollDeviceRequest } from '@airremote/contracts';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildTestApp, testEnv } from '../../../__tests__/test-utils';
import { authenticatePlugin } from '../../../plugins/authenticate';
import { AppError } from '../../../shared/errors';
import { signAccessToken } from '../../auth/auth.helpers';
import { devicesRoutes } from '../devices.routes';
import type { DevicesService } from '../devices.service';

const secrets = {
  accessSecret: testEnv.JWT_ACCESS_SECRET,
  refreshSecret: testEnv.JWT_REFRESH_SECRET,
};

const body = {
  macAddress: 'AA:BB:CC:DD:EE:01',
  pairingCode: '7k4m-q9tx',
  name: ' Living room ',
};

const enrolled: DeviceResponse = {
  id: '0b6f1c2a-3c1e-4a8e-9a43-0d5f1f6f2b11',
  macAddress: 'aa:bb:cc:dd:ee:01',
  name: 'Living room',
};

let app: FastifyInstance;
let received: [string, EnrollDeviceRequest][];

async function appWith(enroll: DevicesService['enroll']) {
  received = [];
  app = await buildTestApp();
  await app.register(authenticatePlugin, { secrets });
  await app.register(devicesRoutes, {
    prefix: '/devices',
    env: testEnv,
    service: {
      authorizeConnection: async () => null,
      issuePairingCode: async () => {
        throw new Error('not expected');
      },
      enroll: async (userId, input) => {
        received.push([userId, input]);
        return enroll(userId, input);
      },
    },
  });
  return app;
}

async function post(payload: unknown, { signedIn = true } = {}) {
  const token = await signAccessToken('user-1', secrets);
  return app.inject({
    method: 'POST',
    url: '/devices',
    headers: signedIn ? { authorization: `Bearer ${token}` } : {},
    payload: payload as object,
  });
}

afterEach(async () => {
  await app?.close();
});

describe('POST /devices', () => {
  it('returns 201 with the enrolled device', async () => {
    await appWith(async () => enrolled);
    const res = await post(body);
    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual(enrolled);
    expect(received).toEqual([
      [
        'user-1',
        {
          macAddress: 'AA:BB:CC:DD:EE:01',
          pairingCode: '7K4MQ9TX',
          name: 'Living room',
        },
      ],
    ]);
  });

  it('returns 401 without a token, without calling the service', async () => {
    await appWith(async () => enrolled);
    const res = await post(body, { signedIn: false });
    expect(res.statusCode).toBe(401);
    expect(received).toEqual([]);
  });

  it.each([
    ['an invalid body', { macAddress: 'x' }],
    ['no body', undefined],
  ])(
    'returns 401 without a token for %s, before validating it',
    async (_case, payload) => {
      await appWith(async () => enrolled);
      const res = await post(payload, { signedIn: false });
      expect(res.statusCode).toBe(401);
      expect(res.headers['www-authenticate']).toBe('Bearer');
      expect(res.json().error.code).toBe('UNAUTHORIZED');
      expect(received).toEqual([]);
    },
  );

  it.each([
    ['a dashed MAC', { ...body, macAddress: 'AA-BB-CC-DD-EE-01' }],
    ['a 7-character code', { ...body, pairingCode: '7K4MQ9T' }],
  ])(
    'returns 400 VALIDATION_FAILED for %s, without calling the service',
    async (_case, payload) => {
      await appWith(async () => enrolled);
      const res = await post(payload);
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('VALIDATION_FAILED');
      expect(received).toEqual([]);
    },
  );

  it.each([
    new AppError(
      400,
      'INVALID_PAIRING_CODE',
      'Pairing code is invalid or has expired',
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
    const res = await post(body);
    expect(res.statusCode).toBe(error.statusCode);
    expect(res.json()).toEqual({
      error: { code: error.code, message: error.message },
    });
  });
});
