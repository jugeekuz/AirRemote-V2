import type { DeviceResponse, RemoteResponse } from '@airremote/contracts';

import { getRemoteDevice, isValidRemoteName } from './remotes.helpers';

const desk: DeviceResponse = {
  id: '6f1c0d4e-9a43-4c1b-8d4e-2f0a1b2c3d4e',
  macAddress: 'aa:bb:cc:dd:ee:01',
  name: 'Desk',
  online: true,
};
const hall: DeviceResponse = {
  id: '0b6a3c1e-2f4d-4e5a-9b8c-7d6e5f4a3b2c',
  macAddress: 'aa:bb:cc:dd:ee:02',
  name: 'Hall',
  online: false,
};
const remote: RemoteResponse = {
  id: '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d',
  deviceId: hall.id,
  name: 'Hall heater',
  type: 'heater',
};

describe('getRemoteDevice', () => {
  it('finds the device the remote uses', () => {
    expect(getRemoteDevice(remote, [desk, hall])).toBe(hall);
  });

  it('gives nothing while the device is not listed (yet)', () => {
    expect(getRemoteDevice(remote, [desk])).toBeUndefined();
    expect(getRemoteDevice(remote, [])).toBeUndefined();
  });
});

describe('isValidRemoteName', () => {
  it.each(['TV', 'Living room AC', 'Ψυγείο #2', 'a'.repeat(100), '  AC  '])(
    'takes %j',
    (name) => {
      expect(isValidRemoteName(name)).toBe(true);
    },
  );

  it.each(['', '   ', 'a'.repeat(101)])('refuses %j', (name) => {
    expect(isValidRemoteName(name)).toBe(false);
  });
});
