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
let pressed: [string, string][];
let deleted: [string, string][];

const pressing: DeviceCommandResponse = {
  ...pending,
  kind: 'send_ir',
  expiresAt: '2026-10-26T12:00:05.000Z',
};

async function appWith(
  learn: ButtonsService['learn'],
  press: ButtonsService['press'] = async () => pressing,
  remove: ButtonsService['delete'] = async () => {},
) {
  received = [];
  listed = [];
  pressed = [];
  deleted = [];
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
      press: async (userId, buttonId) => {
        pressed.push([userId, buttonId]);
        return press(userId, buttonId);
      },
      delete: async (userId, buttonId) => {
        deleted.push([userId, buttonId]);
        return remove(userId, buttonId);
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

describe('POST /buttons/:buttonId/press', () => {
  async function press({ signedIn = true, buttonId = button.id } = {}) {
    const token = await signAccessToken('user-1', secrets);
    return app.inject({
      method: 'POST',
      url: `/buttons/${buttonId}/press`,
      headers: signedIn ? { authorization: `Bearer ${token}` } : {},
    });
  }

  it('returns 202 with the pending command and where to poll it', async () => {
    await appWith(async () => pending);
    const res = await press();
    expect(res.statusCode).toBe(202);
    expect(res.headers.location).toBe(`/device-commands/${pressing.id}`);
    expect(res.json()).toEqual(pressing);
    expect(pressed).toEqual([['user-1', button.id]]);
  });

  it('returns 401 without a token, without calling the service', async () => {
    await appWith(async () => pending);
    const res = await press({ signedIn: false });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('UNAUTHORIZED');
    expect(pressed).toEqual([]);
  });

  it('returns 400 VALIDATION_FAILED for a non-UUID button id, without calling the service', async () => {
    await appWith(async () => pending);
    const res = await press({ buttonId: 'not-a-uuid' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_FAILED');
    expect(pressed).toEqual([]);
  });

  it.each([
    new AppError(404, 'NOT_FOUND', 'Button not found'),
    new AppError(409, 'DEVICE_OFFLINE', 'The device is offline'),
    new AppError(409, 'DEVICE_BUSY', 'The device is busy'),
  ])('passes the service error $code through', async (error) => {
    await appWith(
      async () => pending,
      async () => {
        throw error;
      },
    );
    const res = await press();
    expect(res.statusCode).toBe(error.statusCode);
    expect(res.headers.location).toBeUndefined();
    expect(res.json()).toEqual({
      error: { code: error.code, message: error.message },
    });
  });
});

describe('DELETE /buttons/:buttonId', () => {
  async function remove(
    buttonId: string,
    { signedIn = true, fails }: { signedIn?: boolean; fails?: AppError } = {},
  ) {
    await appWith(
      async () => pending,
      async () => pressing,
      async () => {
        if (fails) throw fails;
      },
    );
    const token = await signAccessToken('user-1', secrets);
    return app.inject({
      method: 'DELETE',
      url: `/buttons/${buttonId}`,
      headers: signedIn ? { authorization: `Bearer ${token}` } : {},
    });
  }

  it('returns 204 with no body after deleting the signed-in user’s button', async () => {
    const res = await remove(button.id);
    expect(res.statusCode).toBe(204);
    expect(res.body).toBe('');
    expect(deleted).toEqual([['user-1', button.id]]);
  });

  it('returns 401 without a token, without calling the service', async () => {
    const res = await remove(button.id, { signedIn: false });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('UNAUTHORIZED');
    expect(deleted).toEqual([]);
  });

  it('returns 400 VALIDATION_FAILED for a non-UUID id, without calling the service', async () => {
    const res = await remove('not-a-uuid');
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_FAILED');
    expect(deleted).toEqual([]);
  });

  it('passes 404 NOT_FOUND through', async () => {
    const error = new AppError(404, 'NOT_FOUND', 'Button not found');
    const res = await remove(button.id, { fails: error });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({
      error: { code: 'NOT_FOUND', message: 'Button not found' },
    });
  });
});
