import type { Device } from '@airremote/db';
import { describe, expect, it, vi } from 'vitest';
import { AppError } from '../../../shared/errors';
import { hashPairingCode } from '../devices.helpers';
import type { DevicesRepository, EnrollResult } from '../devices.repository';
import { createDevicesService } from '../devices.service';

const device: Device = {
  id: '0b6f1c2a-3c1e-4a8e-9a43-0d5f1f6f2b11',
  userId: '6f1c2a52-3c1e-4a8e-9a43-0d5f1f6f2b11',
  macAddress: 'aa:bb:cc:dd:ee:01',
  name: 'Living room',
  firmwareVersion: '0.1.0',
};

const secret = 'test-pairing-secret-0123456789abcdef';
const now = new Date('2026-10-26T12:00:00.000Z');

function serviceWith({
  found = async () => device,
  enrolled = async () => ({ status: 'enrolled', device }),
  listed = async () => [device],
  connected = () => false,
  deleted = async () => true,
}: {
  found?: () => Promise<Device | null>;
  enrolled?: () => Promise<EnrollResult>;
  listed?: () => Promise<Device[]>;
  connected?: (deviceId: string) => boolean;
  deleted?: () => Promise<boolean>;
} = {}) {
  const repository = {
    findByMacAddress: vi.fn(found),
    savePairingCode: vi.fn(async () => {}),
    enroll: vi.fn(enrolled),
    listForUser: vi.fn(listed),
    setFirmwareVersion: vi.fn(async () => {}),
    deleteForUser: vi.fn(deleted),
  };
  const connections = {
    isConnected: vi.fn(connected),
    disconnect: vi.fn(() => true),
  };
  const service = createDevicesService({
    repository: repository satisfies DevicesRepository,
    connections,
    pairingCodeSecret: secret,
    now: () => now,
    generateCode: () => '7K4MQ9TX',
  });
  return { service, repository, connections };
}

async function appErrorOf(promise: Promise<unknown>) {
  const error = await promise.then(
    () => null,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(AppError);
  const { statusCode, code } = error as AppError;
  return { statusCode, code };
}

describe('devices service: authorizeConnection', () => {
  it('allows a device whose MAC has a devices row', async () => {
    const { service } = serviceWith();
    expect(await service.authorizeConnection('AA:BB:CC:DD:EE:01')).toEqual({
      id: device.id,
      macAddress: 'aa:bb:cc:dd:ee:01',
    });
  });

  it('looks the MAC up in lower case', async () => {
    const { service, repository } = serviceWith();
    await service.authorizeConnection('AA:BB:CC:DD:EE:01');
    expect(repository.findByMacAddress).toHaveBeenCalledExactlyOnceWith(
      'aa:bb:cc:dd:ee:01',
    );
  });

  it('rejects a device with no row', async () => {
    const { service } = serviceWith({ found: async () => null });
    expect(await service.authorizeConnection('AA:BB:CC:DD:EE:02')).toBeNull();
  });

  it('rejects a common name that is not a MAC without querying', async () => {
    const { service, repository } = serviceWith();
    expect(await service.authorizeConnection('device-01')).toBeNull();
    expect(repository.findByMacAddress).not.toHaveBeenCalled();
  });

  it('fails closed when the lookup throws', async () => {
    const { service } = serviceWith({
      found: async () => {
        throw new Error('database down');
      },
    });
    await expect(
      service.authorizeConnection('AA:BB:CC:DD:EE:01'),
    ).rejects.toThrow('database down');
  });
});

describe('devices service: issuePairingCode', () => {
  it('issues a code that expires in 15 minutes', async () => {
    const { service, repository } = serviceWith({ found: async () => null });
    expect(await service.issuePairingCode('AA:BB:CC:DD:EE:01')).toEqual({
      pairingCode: '7K4MQ9TX',
      expiresAt: '2026-10-26T12:15:00.000Z',
    });
    expect(repository.savePairingCode).toHaveBeenCalledExactlyOnceWith({
      macAddress: 'aa:bb:cc:dd:ee:01',
      codeHash: hashPairingCode('7K4MQ9TX', secret),
      expiresAt: new Date('2026-10-26T12:15:00.000Z'),
    });
  });

  it.each([null, 'device-01'])(
    'refuses a code to the common name %j with 403',
    async (commonName) => {
      const { service, repository } = serviceWith({ found: async () => null });
      expect(await appErrorOf(service.issuePairingCode(commonName))).toEqual({
        statusCode: 403,
        code: 'INVALID_DEVICE_CERTIFICATE',
      });
      expect(repository.savePairingCode).not.toHaveBeenCalled();
    },
  );

  it('refuses a code to an enrolled device with 409', async () => {
    const { service, repository } = serviceWith();
    expect(
      await appErrorOf(service.issuePairingCode('AA:BB:CC:DD:EE:01')),
    ).toEqual({ statusCode: 409, code: 'DEVICE_ALREADY_REGISTERED' });
    expect(repository.savePairingCode).not.toHaveBeenCalled();
  });
});

describe('devices service: enroll', () => {
  const input = {
    macAddress: 'AA:BB:CC:DD:EE:01',
    pairingCode: '7K4MQ9TX',
    name: 'Living room',
  };

  it('enrolls with the lower-cased MAC and the hashed code', async () => {
    const { service, repository } = serviceWith();
    expect(await service.enroll('user-1', input)).toEqual({
      id: device.id,
      macAddress: 'aa:bb:cc:dd:ee:01',
      name: 'Living room',
      online: false,
    });
    expect(repository.enroll).toHaveBeenCalledExactlyOnceWith({
      macAddress: 'aa:bb:cc:dd:ee:01',
      codeHash: hashPairingCode('7K4MQ9TX', secret),
      now,
      userId: 'user-1',
      name: 'Living room',
    });
  });

  it('reports a device that is already connected as online', async () => {
    const { service } = serviceWith({ connected: (id) => id === device.id });
    expect(await service.enroll('user-1', input)).toMatchObject({
      online: true,
    });
  });

  it('reports a bad code before an enrolled MAC', async () => {
    const { service } = serviceWith({
      enrolled: async () => ({ status: 'invalid-code' }),
    });
    expect(await appErrorOf(service.enroll('user-1', input))).toEqual({
      statusCode: 400,
      code: 'INVALID_PAIRING_CODE',
    });
  });

  it('maps already-registered to 409 DEVICE_ALREADY_REGISTERED', async () => {
    const { service } = serviceWith({
      enrolled: async () => ({ status: 'already-registered' }),
    });
    expect(await appErrorOf(service.enroll('user-1', input))).toEqual({
      statusCode: 409,
      code: 'DEVICE_ALREADY_REGISTERED',
    });
  });
});

describe('devices service: list', () => {
  it('returns the user’s devices without their owner or firmware version', async () => {
    const { service, repository } = serviceWith();

    await expect(service.list(device.userId)).resolves.toEqual([
      {
        id: device.id,
        macAddress: device.macAddress,
        name: device.name,
        online: false,
      },
    ]);
    expect(repository.listForUser).toHaveBeenCalledExactlyOnceWith(
      device.userId,
    );
  });

  it('marks each device online or offline from the connections', async () => {
    const other = { ...device, id: 'other-device', name: 'Bedroom' };
    const { service } = serviceWith({
      listed: async () => [device, other],
      connected: (id) => id === other.id,
    });
    const list = await service.list(device.userId);
    expect(list.map(({ id, online }) => [id, online])).toEqual([
      [device.id, false],
      [other.id, true],
    ]);
  });

  it('returns an empty list when there are none', async () => {
    const { service } = serviceWith({ listed: async () => [] });
    await expect(service.list(device.userId)).resolves.toEqual([]);
  });
});

describe('devices service: recordFirmwareVersion', () => {
  it('stores the version the device said hello with', async () => {
    const { service, repository } = serviceWith();

    await service.recordFirmwareVersion(device.id, '0.2.0');

    expect(repository.setFirmwareVersion).toHaveBeenCalledExactlyOnceWith(
      device.id,
      '0.2.0',
    );
  });
});

describe('devices service: delete', () => {
  it('deletes the user’s device, then closes its connection', async () => {
    const { service, repository, connections } = serviceWith();

    await service.delete(device.userId, device.id);

    expect(repository.deleteForUser).toHaveBeenCalledExactlyOnceWith(
      device.id,
      device.userId,
    );
    expect(connections.disconnect).toHaveBeenCalledExactlyOnceWith(device.id);
    // Deleted first, so the device's reconnect is already refused.
    expect(repository.deleteForUser.mock.invocationCallOrder[0]).toBeLessThan(
      connections.disconnect.mock.invocationCallOrder[0]!,
    );
  });

  it('answers 404 NOT_FOUND for a device that is missing or another user’s, closing nothing', async () => {
    const { service, connections } = serviceWith({
      deleted: async () => false,
    });

    expect(await appErrorOf(service.delete(device.userId, device.id))).toEqual({
      statusCode: 404,
      code: 'NOT_FOUND',
    });
    expect(connections.disconnect).not.toHaveBeenCalled();
  });
});
