import type { DeviceCommandResponse } from '@airremote/contracts';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildTestApp, testEnv } from '../../../__tests__/test-utils';
import { authenticatePlugin } from '../../../plugins/authenticate';
import { createDeviceConnections } from '../../../shared/device-connections';
import { AppError } from '../../../shared/errors';
import { signAccessToken } from '../../auth/auth.helpers';
import { deviceCommandsRoutes } from '../device-commands.routes';
import type { DeviceCommandsService } from '../device-commands.service';

const secrets = {
  accessSecret: testEnv.JWT_ACCESS_SECRET,
  refreshSecret: testEnv.JWT_REFRESH_SECRET,
};

const commandId = '2a523c1e-4a8e-4a43-8d5f-1f6f2b110101';

const failed: DeviceCommandResponse = {
  id: commandId,
  kind: 'learn_button',
  status: 'failed',
  createdAt: '2026-10-26T12:00:00.000Z',
  expiresAt: '2026-10-26T12:00:20.000Z',
  error: {
    code: 'IR_READ_TIMEOUT',
    message: 'The device did not see an IR code in time.',
  },
};

let app: FastifyInstance;
let received: [string, string][];

async function appWith(get: DeviceCommandsService['get']) {
  received = [];
  app = await buildTestApp();
  await app.register(authenticatePlugin, { secrets });
  const unexpected = async () => {
    throw new Error('not expected');
  };
  await app.register(deviceCommandsRoutes, {
    connections: createDeviceConnections(),
    service: {
      startLearnButton: unexpected,
      settleReadResult: unexpected,
      settleError: unexpected,
      connectionClosed: unexpected,
      get: async (userId, id) => {
        received.push([userId, id]);
        return get(userId, id);
      },
    },
  });
  return app;
}

async function poll(id: string, { signedIn = true } = {}) {
  const token = await signAccessToken('user-1', secrets);
  return app.inject({
    method: 'GET',
    url: `/device-commands/${id}`,
    headers: signedIn ? { authorization: `Bearer ${token}` } : {},
  });
}

afterEach(async () => {
  await app?.close();
});

describe('GET /device-commands/:id', () => {
  it('returns 200 with the command', async () => {
    await appWith(async () => failed);
    const res = await poll(commandId);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(failed);
    expect(received).toEqual([['user-1', commandId]]);
  });

  it('returns 401 without a token, without calling the service', async () => {
    await appWith(async () => failed);
    const res = await poll(commandId, { signedIn: false });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('UNAUTHORIZED');
    expect(received).toEqual([]);
  });

  it('returns 400 VALIDATION_FAILED for a non-UUID id, without calling the service', async () => {
    await appWith(async () => failed);
    const res = await poll('not-a-uuid');
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_FAILED');
    expect(received).toEqual([]);
  });

  it('passes 404 NOT_FOUND through', async () => {
    const error = new AppError(404, 'NOT_FOUND', 'Device command not found');
    await appWith(async () => {
      throw error;
    });
    const res = await poll(commandId);
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({
      error: { code: 'NOT_FOUND', message: error.message },
    });
  });
});
