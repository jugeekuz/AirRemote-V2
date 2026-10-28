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
  /**
   * Asks the button's device to send its IR code. Returns the pending
   * command; the device's reply settles it.
   */
  press(userId: string, buttonId: string): Promise<DeviceCommandResponse>;
  /** Deletes one of the user's buttons. */
  delete(userId: string, buttonId: string): Promise<void>;
};

export function createButtonsService({
  repository,
  deviceCommands,
}: {
  repository: ButtonsRepository;
  deviceCommands: Pick<
    DeviceCommandsService,
    'startLearnButton' | 'startSendIr'
  >;
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

    async press(userId, buttonId) {
      const button = await repository.findOwnedButton(buttonId, userId);
      if (!button) throw new AppError(404, 'NOT_FOUND', 'Button not found');
      return deviceCommands.startSendIr({
        deviceId: button.deviceId,
        buttonId: button.id,
        timingsUs: button.timingsUs,
      });
    },

    async delete(userId, buttonId) {
      // Someone else's button answers as a missing one.
      if (!(await repository.deleteForUser(buttonId, userId))) {
        throw new AppError(404, 'NOT_FOUND', 'Button not found');
      }
    },
  };
}
