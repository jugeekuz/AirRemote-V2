import type { CreateRemoteRequest, RemoteResponse } from '@airremote/contracts';
import { AppError } from '../../shared/errors';
import type { RemotesRepository } from './remotes.repository';

export type RemotesService = {
  /** Creates a remote on one of the user's devices. */
  create(
    userId: string,
    deviceId: string,
    input: CreateRemoteRequest,
  ): Promise<RemoteResponse>;
};

export function createRemotesService({
  repository,
}: {
  repository: RemotesRepository;
}): RemotesService {
  return {
    async create(userId, deviceId, { name, type }) {
      if (!(await repository.findOwnedDevice(deviceId, userId))) {
        throw new AppError(404, 'NOT_FOUND', 'Device not found');
      }
      const remote = await repository.create({ deviceId, name, type });
      if (!remote) {
        throw new AppError(
          409,
          'REMOTE_NAME_TAKEN',
          'The device already has a remote with this name',
        );
      }
      return {
        id: remote.id,
        deviceId: remote.deviceId,
        name: remote.name,
        type: remote.type,
      };
    },
  };
}
