import type { DeviceCommandResponse } from '@airremote/contracts';
import { describe, expect, it, vi } from 'vitest';
import { AppError } from '../../../shared/errors';
import type { ButtonsRepository } from '../buttons.repository';
import { createButtonsService } from '../buttons.service';

const userId = '6f1c2a52-3c1e-4a8e-9a43-0d5f1f6f2b11';
const deviceId = '0b6f1c2a-3c1e-4a8e-9a43-0d5f1f6f2b11';
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

const timingsUs = [9000, 4500, 560];

const ownedButton = { id: button.id, remoteId, deviceId, timingsUs };

const pressing: DeviceCommandResponse = {
  ...pending,
  kind: 'send_ir',
  expiresAt: '2026-10-26T12:00:05.000Z',
};

function serviceWith({
  owned = async () => ({ id: remoteId, deviceId }),
  taken = async () => false,
  started = async () => pending,
  listed = async () => [button],
  ownedButtonFound = async () => ownedButton,
  sent = async () => pressing,
}: {
  owned?: () => Promise<{ id: string; deviceId: string } | null>;
  taken?: () => Promise<boolean>;
  started?: () => Promise<DeviceCommandResponse>;
  listed?: () => Promise<{ id: string; remoteId: string; name: string }[]>;
  ownedButtonFound?: () => Promise<typeof ownedButton | null>;
  sent?: () => Promise<DeviceCommandResponse>;
} = {}) {
  const repository = {
    findOwnedRemote: vi.fn(owned),
    findOwnedButton: vi.fn(ownedButtonFound),
    nameTaken: vi.fn(taken),
    listForRemote: vi.fn(listed),
  };
  const deviceCommands = {
    startLearnButton: vi.fn(started),
    startSendIr: vi.fn(sent),
  };
  const service = createButtonsService({
    repository: repository satisfies ButtonsRepository,
    deviceCommands,
  });
  return { service, repository, deviceCommands };
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

describe('buttons service: learn', () => {
  it('starts learning on the remote’s device and returns the pending command', async () => {
    const { service, repository, deviceCommands } = serviceWith();

    await expect(
      service.learn(userId, remoteId, { name: 'Power' }),
    ).resolves.toEqual(pending);
    expect(repository.findOwnedRemote).toHaveBeenCalledExactlyOnceWith(
      remoteId,
      userId,
    );
    expect(repository.nameTaken).toHaveBeenCalledExactlyOnceWith(
      remoteId,
      'Power',
    );
    expect(deviceCommands.startLearnButton).toHaveBeenCalledExactlyOnceWith({
      deviceId,
      remoteId,
      name: 'Power',
    });
  });

  it('answers 404 NOT_FOUND for a remote that is not the user’s, asking nothing else', async () => {
    const { service, repository, deviceCommands } = serviceWith({
      owned: async () => null,
    });

    await expect(
      appErrorOf(service.learn(userId, remoteId, { name: 'Power' })),
    ).resolves.toEqual({ statusCode: 404, code: 'NOT_FOUND' });
    expect(repository.nameTaken).not.toHaveBeenCalled();
    expect(deviceCommands.startLearnButton).not.toHaveBeenCalled();
  });

  it('answers 409 BUTTON_NAME_TAKEN before asking the device', async () => {
    const { service, deviceCommands } = serviceWith({
      taken: async () => true,
    });

    await expect(
      appErrorOf(service.learn(userId, remoteId, { name: 'Power' })),
    ).resolves.toEqual({ statusCode: 409, code: 'BUTTON_NAME_TAKEN' });
    expect(deviceCommands.startLearnButton).not.toHaveBeenCalled();
  });

  it('passes the device commands’ errors through', async () => {
    const offline = new AppError(409, 'DEVICE_OFFLINE', 'Device is offline');
    const { service } = serviceWith({
      started: async () => {
        throw offline;
      },
    });

    await expect(
      service.learn(userId, remoteId, { name: 'Power' }),
    ).rejects.toBe(offline);
  });
});

describe('buttons service: list', () => {
  it('returns the buttons of a remote the user owns', async () => {
    const { service, repository } = serviceWith();

    await expect(service.list(userId, remoteId)).resolves.toEqual([button]);
    expect(repository.findOwnedRemote).toHaveBeenCalledExactlyOnceWith(
      remoteId,
      userId,
    );
    expect(repository.listForRemote).toHaveBeenCalledExactlyOnceWith(remoteId);
  });

  it('answers 404 NOT_FOUND for a remote that is not the user’s, listing nothing', async () => {
    const { service, repository } = serviceWith({ owned: async () => null });

    await expect(appErrorOf(service.list(userId, remoteId))).resolves.toEqual({
      statusCode: 404,
      code: 'NOT_FOUND',
    });
    expect(repository.listForRemote).not.toHaveBeenCalled();
  });
});

describe('buttons service: press', () => {
  it('sends the button’s timings from its device and returns the pending command', async () => {
    const { service, repository, deviceCommands } = serviceWith();

    await expect(service.press(userId, button.id)).resolves.toEqual(pressing);
    expect(repository.findOwnedButton).toHaveBeenCalledExactlyOnceWith(
      button.id,
      userId,
    );
    expect(deviceCommands.startSendIr).toHaveBeenCalledExactlyOnceWith({
      deviceId,
      buttonId: button.id,
      timingsUs,
    });
  });

  it('answers 404 NOT_FOUND for a button that is not the user’s, sending nothing', async () => {
    const { service, deviceCommands } = serviceWith({
      ownedButtonFound: async () => null,
    });

    await expect(appErrorOf(service.press(userId, button.id))).resolves.toEqual(
      { statusCode: 404, code: 'NOT_FOUND' },
    );
    expect(deviceCommands.startSendIr).not.toHaveBeenCalled();
  });

  it('passes the device commands’ errors through', async () => {
    const busy = new AppError(409, 'DEVICE_BUSY', 'The device is busy');
    const { service } = serviceWith({
      sent: async () => {
        throw busy;
      },
    });

    await expect(service.press(userId, button.id)).rejects.toBe(busy);
  });
});
