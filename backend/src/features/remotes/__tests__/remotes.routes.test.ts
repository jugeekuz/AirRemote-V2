import type { CreateRemoteRequest, RemoteResponse } from '@airremote/contracts';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildTestApp, testEnv } from '../../../__tests__/test-utils';
import { authenticatePlugin } from '../../../plugins/authenticate';
import { AppError } from '../../../shared/errors';
import { signAccessToken } from '../../auth/auth.helpers';
import { remotesRoutes } from '../remotes.routes';
import type { RemotesService } from '../remotes.service';

const secrets = {
  accessSecret: testEnv.JWT_ACCESS_SECRET,
  refreshSecret: testEnv.JWT_REFRESH_SECRET,
};

const deviceId = '0b6f1c2a-3c1e-4a8e-9a43-0d5f1f6f2b11';

const created: RemoteResponse = {
  id: '1c2a523c-1e4a-4e9a-830d-5f1f6f2b1101',
  deviceId,
  name: 'Living room TV',
  type: 'smart_tv',
};

let app: FastifyInstance;
let received: [string, string, CreateRemoteRequest][];
let listed: string[];
let deleted: [string, string][];

async function appWith(
  create: RemotesService['create'],
  remove: RemotesService['delete'] = async () => {},
) {
  received = [];
  listed = [];
  deleted = [];
  app = await buildTestApp();
  await app.register(authenticatePlugin, { secrets });
  await app.register(remotesRoutes, {
    service: {
      create: async (userId, forDevice, input) => {
        received.push([userId, forDevice, input]);
        return create(userId, forDevice, input);
      },
      list: async (userId) => {
        listed.push(userId);
        return [created];
      },
      delete: async (userId, remoteId) => {
        deleted.push([userId, remoteId]);
        return remove(userId, remoteId);
      },
    },
  });
  return app;
}

async function post(
  payload: unknown,
  { signedIn = true, device = deviceId } = {},
) {
  const token = await signAccessToken('user-1', secrets);
  return app.inject({
    method: 'POST',
    url: `/devices/${device}/remotes`,
    headers: signedIn ? { authorization: `Bearer ${token}` } : {},
    payload: payload as object,
  });
}

afterEach(async () => {
  await app?.close();
});

describe('POST /devices/:deviceId/remotes', () => {
  it('returns 201 with the created remote', async () => {
    await appWith(async () => created);
    const res = await post({ name: ' Living room TV ', type: 'smart_tv' });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual(created);
    expect(received).toEqual([
      ['user-1', deviceId, { name: 'Living room TV', type: 'smart_tv' }],
    ]);
  });

  it('returns 401 without a token, without calling the service', async () => {
    await appWith(async () => created);
    const res = await post(
      { name: 'TV', type: 'smart_tv' },
      { signedIn: false },
    );
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('UNAUTHORIZED');
    expect(received).toEqual([]);
  });

  it.each([
    ['a non-UUID device id', { name: 'TV', type: 'smart_tv' }, 'not-a-uuid'],
    ['an unknown type', { name: 'TV', type: 'toaster' }, deviceId],
    ['a blank name', { name: '   ', type: 'smart_tv' }, deviceId],
  ])(
    'returns 400 VALIDATION_FAILED for %s, without calling the service',
    async (_case, payload, device) => {
      await appWith(async () => created);
      const res = await post(payload, { device });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('VALIDATION_FAILED');
      expect(received).toEqual([]);
    },
  );

  it.each([
    new AppError(404, 'NOT_FOUND', 'Device not found'),
    new AppError(409, 'REMOTE_NAME_TAKEN', 'A remote with this name exists'),
  ])('passes the service error $code through', async (error) => {
    await appWith(async () => {
      throw error;
    });
    const res = await post({ name: 'TV', type: 'smart_tv' });
    expect(res.statusCode).toBe(error.statusCode);
    expect(res.json()).toEqual({
      error: { code: error.code, message: error.message },
    });
  });
});

describe('GET /remotes', () => {
  async function get({ signedIn = true } = {}) {
    await appWith(async () => created);
    const token = await signAccessToken('user-1', secrets);
    return app.inject({
      method: 'GET',
      url: '/remotes',
      headers: signedIn ? { authorization: `Bearer ${token}` } : {},
    });
  }

  it('returns 200 with the signed-in user’s remotes', async () => {
    const res = await get();
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([created]);
    expect(listed).toEqual(['user-1']);
  });

  it('returns 401 without a token, without calling the service', async () => {
    const res = await get({ signedIn: false });
    expect(res.statusCode).toBe(401);
    expect(listed).toEqual([]);
  });
});

describe('DELETE /remotes/:remoteId', () => {
  async function remove(
    remoteId: string,
    { signedIn = true, fails }: { signedIn?: boolean; fails?: AppError } = {},
  ) {
    await appWith(
      async () => created,
      async () => {
        if (fails) throw fails;
      },
    );
    const token = await signAccessToken('user-1', secrets);
    return app.inject({
      method: 'DELETE',
      url: `/remotes/${remoteId}`,
      headers: signedIn ? { authorization: `Bearer ${token}` } : {},
    });
  }

  it('returns 204 with no body after deleting the signed-in user’s remote', async () => {
    const res = await remove(created.id);
    expect(res.statusCode).toBe(204);
    expect(res.body).toBe('');
    expect(deleted).toEqual([['user-1', created.id]]);
  });

  it('returns 401 without a token, without calling the service', async () => {
    const res = await remove(created.id, { signedIn: false });
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
    const error = new AppError(404, 'NOT_FOUND', 'Remote not found');
    const res = await remove(created.id, { fails: error });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({
      error: { code: 'NOT_FOUND', message: 'Remote not found' },
    });
  });
});
