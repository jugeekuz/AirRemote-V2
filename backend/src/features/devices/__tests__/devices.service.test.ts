import type { Device } from '@airremote/db';
import { describe, expect, it, vi } from 'vitest';
import type { DevicesRepository } from '../devices.repository';
import { createDevicesService } from '../devices.service';

const device: Device = {
  id: '0b6f1c2a-3c1e-4a8e-9a43-0d5f1f6f2b11',
  userId: '6f1c2a52-3c1e-4a8e-9a43-0d5f1f6f2b11',
  macAddress: 'aa:bb:cc:dd:ee:01',
  name: 'Living room',
};

function serviceWith(found: () => Promise<Device | null>) {
  const repository = {
    findByMacAddress: vi.fn(found),
    savePairingCode: vi.fn(async () => {}),
    enroll: vi.fn(async () => ({ status: 'invalid-code' }) as const),
  };
  const service = createDevicesService({
    repository: repository satisfies DevicesRepository,
  });
  return { service, repository };
}

describe('devices service: authorizeConnection', () => {
  it('allows a device whose MAC has a devices row', async () => {
    const { service } = serviceWith(async () => device);
    expect(await service.authorizeConnection('AA:BB:CC:DD:EE:01')).toEqual({
      id: device.id,
      macAddress: 'aa:bb:cc:dd:ee:01',
    });
  });

  it('looks the MAC up in lower case', async () => {
    const { service, repository } = serviceWith(async () => device);
    await service.authorizeConnection('AA:BB:CC:DD:EE:01');
    expect(repository.findByMacAddress).toHaveBeenCalledExactlyOnceWith(
      'aa:bb:cc:dd:ee:01',
    );
  });

  it('rejects a device with no row', async () => {
    const { service } = serviceWith(async () => null);
    expect(await service.authorizeConnection('AA:BB:CC:DD:EE:02')).toBeNull();
  });

  it('rejects a common name that is not a MAC without querying', async () => {
    const { service, repository } = serviceWith(async () => device);
    expect(await service.authorizeConnection('device-01')).toBeNull();
    expect(repository.findByMacAddress).not.toHaveBeenCalled();
  });

  it('fails closed when the lookup throws', async () => {
    const { service } = serviceWith(async () => {
      throw new Error('database down');
    });
    await expect(
      service.authorizeConnection('AA:BB:CC:DD:EE:01'),
    ).rejects.toThrow('database down');
  });
});
