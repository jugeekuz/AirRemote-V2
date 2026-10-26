import type { Remote } from '@airremote/db';
import { describe, expect, it, vi } from 'vitest';
import { AppError } from '../../../shared/errors';
import type { RemotesRepository } from '../remotes.repository';
import { createRemotesService } from '../remotes.service';

const userId = '6f1c2a52-3c1e-4a8e-9a43-0d5f1f6f2b11';
const deviceId = '0b6f1c2a-3c1e-4a8e-9a43-0d5f1f6f2b11';

const remote: Remote = {
  id: '1c2a523c-1e4a-4e9a-830d-5f1f6f2b1101',
  deviceId,
  name: 'Living room TV',
  type: 'smart_tv',
};

function serviceWith({
  owned = async () => ({ id: deviceId }),
  created = async () => remote,
}: {
  owned?: () => Promise<{ id: string } | null>;
  created?: () => Promise<Remote | null>;
} = {}) {
  const repository = {
    findOwnedDevice: vi.fn(owned),
    create: vi.fn(created),
  };
  const service = createRemotesService({
    repository: repository satisfies RemotesRepository,
  });
  return { service, repository };
}

async function appErrorOf(promise: Promise<unknown>) {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(AppError);
  const { statusCode, code } = error as AppError;
  return { statusCode, code };
}

const input = { name: 'Living room TV', type: 'smart_tv' } as const;

describe('remotes service: create', () => {
  it('creates the remote on the user’s device', async () => {
    const { service, repository } = serviceWith();

    await expect(service.create(userId, deviceId, input)).resolves.toEqual({
      id: remote.id,
      deviceId,
      name: 'Living room TV',
      type: 'smart_tv',
    });
    expect(repository.findOwnedDevice).toHaveBeenCalledExactlyOnceWith(
      deviceId,
      userId,
    );
    expect(repository.create).toHaveBeenCalledExactlyOnceWith({
      deviceId,
      name: 'Living room TV',
      type: 'smart_tv',
    });
  });

  it('answers 404 NOT_FOUND for a device that is not the user’s, creating nothing', async () => {
    const { service, repository } = serviceWith({ owned: async () => null });

    await expect(
      appErrorOf(service.create(userId, deviceId, input)),
    ).resolves.toEqual({ statusCode: 404, code: 'NOT_FOUND' });
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('answers 409 REMOTE_NAME_TAKEN when the name is used on the device', async () => {
    const { service } = serviceWith({ created: async () => null });

    await expect(
      appErrorOf(service.create(userId, deviceId, input)),
    ).resolves.toEqual({ statusCode: 409, code: 'REMOTE_NAME_TAKEN' });
  });
});
