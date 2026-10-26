import type {
  ButtonResponse,
  DeviceCommandResponse,
  LearnButtonRequest,
} from '@airremote/contracts';
import { AppError } from '../../shared/errors';
import type { DeviceCommandsService } from '../device-commands/device-commands.service';
import type { ButtonsRepository } from './buttons.repository';

export type ButtonsService = {
  /**
   * Asks the remote's device to read an IR code for a new button. Returns
   * the pending command; the button is saved when the device answers.
   */
  learn(
    userId: string,
    remoteId: string,
    input: LearnButtonRequest,
  ): Promise<DeviceCommandResponse>;
  /** The buttons of one of the user's remotes, by name ignoring case. */
  list(userId: string, remoteId: string): Promise<ButtonResponse[]>;
};

export function createButtonsService({
  repository,
  deviceCommands,
}: {
  repository: ButtonsRepository;
  deviceCommands: Pick<DeviceCommandsService, 'startLearnButton'>;
}): ButtonsService {
  return {
    async learn(userId, remoteId, { name }) {
      const remote = await repository.findOwnedRemote(remoteId, userId);
      if (!remote) throw new AppError(404, 'NOT_FOUND', 'Remote not found');
      // Checked before asking the device, so a taken name costs no IR read.
      if (await repository.nameTaken(remote.id, name)) {
        throw new AppError(
          409,
          'BUTTON_NAME_TAKEN',
          'The remote already has a button with this name',
        );
      }
      return deviceCommands.startLearnButton({
        deviceId: remote.deviceId,
        remoteId: remote.id,
        name,
      });
    },

    async list(userId, remoteId) {
      if (!(await repository.findOwnedRemote(remoteId, userId))) {
        throw new AppError(404, 'NOT_FOUND', 'Remote not found');
      }
      return repository.listForRemote(remoteId);
    },
  };
}
