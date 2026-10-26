import type {
  DeviceCommandResponse,
  LearnButtonRequest,
} from '@airremote/contracts';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildTestApp, testEnv } from '../../../__tests__/test-utils';
import { authenticatePlugin } from '../../../plugins/authenticate';
import { createDeviceConnections } from '../../../shared/device-connections';
import { AppError } from '../../../shared/errors';
import { signAccessToken } from '../../auth/auth.helpers';
import { buttonsRoutes } from '../buttons.routes';
import type { ButtonsService } from '../buttons.service';

const secrets = {
  accessSecret: testEnv.JWT_ACCESS_SECRET,
  refreshSecret: testEnv.JWT_REFRESH_SECRET,
};

const remoteId = '1c2a523c-1e4a-4e9a-830d-5f1f6f2b1101';

const pending: DeviceCommandResponse = {
  id: '2a523c1e-4a8e-4a43-8d5f-1f6f2b110101',
  kind: 'learn_button',
  status: 'pending',
  createdAt: '2026-10-26T12:00:00.000Z',
  expiresAt: '2026-10-26T12:00:20.000Z',
};

const button = {
  id: '3c1e4a8e-4a43-4d5f-9f6f-2b1101010101',
  remoteId,
  name: 'Power',
};

let app: FastifyInstance;
let received: [string, string, LearnButtonRequest][];
let listed: [string, string][];

async function appWith(learn: ButtonsService['learn']) {
  received = [];
  listed = [];
  app = await buildTestApp();
  await app.register(authenticatePlugin, { secrets });
  await app.register(buttonsRoutes, {
    connections: createDeviceConnections(),
    service: {
      learn: async (userId, forRemote, input) => {
        received.push([userId, forRemote, input]);
        return learn(userId, forRemote, input);
      },
      list: async (userId, forRemote) => {
        listed.push([userId, forRemote]);
        return [button];
      },
    },
  });
  return app;
}

async function post(
  payload: unknown,
  { signedIn = true, remote = remoteId } = {},
) {
  const token = await signAccessToken('user-1', secrets);
  return app.inject({
    method: 'POST',
    url: `/remotes/${remote}/buttons`,
    headers: signedIn ? { authorization: `Bearer ${token}` } : {},
    payload: payload as object,
  });
}

afterEach(async () => {
  await app?.close();
});

describe('POST /remotes/:remoteId/buttons', () => {
  it('returns 202 with the pending command and where to poll it', async () => {
    await appWith(async () => pending);
    const res = await post({ name: ' Power ' });
    expect(res.statusCode).toBe(202);
    expect(res.headers.location).toBe(`/device-commands/${pending.id}`);
    expect(res.json()).toEqual(pending);
    expect(received).toEqual([['user-1', remoteId, { name: 'Power' }]]);
  });

  it('returns 401 without a token, without calling the service', async () => {
    await appWith(async () => pending);
    const res = await post({ name: 'Power' }, { signedIn: false });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('UNAUTHORIZED');
    expect(received).toEqual([]);
  });

  it.each([
    ['a non-UUID remote id', { name: 'Power' }, 'not-a-uuid'],
    ['a blank name', { name: '  ' }, remoteId],
    ['no name', {}, remoteId],
  ])(
    'returns 400 VALIDATION_FAILED for %s, without calling the service',
    async (_case, payload, remote) => {
      await appWith(async () => pending);
      const res = await post(payload, { remote });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('VALIDATION_FAILED');
      expect(received).toEqual([]);
    },
  );

  it.each([
    new AppError(404, 'NOT_FOUND', 'Remote not found'),
    new AppError(409, 'BUTTON_NAME_TAKEN', 'A button with this name exists'),
    new AppError(409, 'DEVICE_OFFLINE', 'The device is offline'),
    new AppError(409, 'DEVICE_BUSY', 'The device is busy'),
  ])('passes the service error $code through', async (error) => {
    await appWith(async () => {
      throw error;
    });
    const res = await post({ name: 'Power' });
    expect(res.statusCode).toBe(error.statusCode);
    expect(res.headers.location).toBeUndefined();
    expect(res.json()).toEqual({
      error: { code: error.code, message: error.message },
    });
  });
});

describe('GET /remotes/:remoteId/buttons', () => {
  async function get({ signedIn = true, remote = remoteId } = {}) {
    await appWith(async () => pending);
    const token = await signAccessToken('user-1', secrets);
    return app.inject({
      method: 'GET',
      url: `/remotes/${remote}/buttons`,
      headers: signedIn ? { authorization: `Bearer ${token}` } : {},
    });
  }

  it('returns 200 with the remote’s buttons', async () => {
    const res = await get();
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([button]);
    expect(listed).toEqual([['user-1', remoteId]]);
  });

  it('returns 401 without a token, without calling the service', async () => {
    const res = await get({ signedIn: false });
    expect(res.statusCode).toBe(401);
    expect(listed).toEqual([]);
  });

  it('returns 400 VALIDATION_FAILED for a non-UUID remote id', async () => {
    const res = await get({ remote: 'not-a-uuid' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_FAILED');
    expect(listed).toEqual([]);
  });
});
