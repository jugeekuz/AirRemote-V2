import { getStateFromLink } from './linking';

describe('linking', () => {
  it('opens a pairing link on the device list with its mac and code', () => {
    expect(
      getStateFromLink('pair?mac=AA:BB:CC:DD:EE:01&code=7K4MQ9TX'),
    ).toMatchObject({
      routes: [
        {
          name: 'Main',
          state: {
            routes: [
              {
                name: 'Devices',
                state: {
                  routes: [
                    {
                      name: 'DeviceList',
                      params: {
                        pairMac: 'AA:BB:CC:DD:EE:01',
                        pairCode: '7K4MQ9TX',
                      },
                    },
                  ],
                },
              },
            ],
          },
        },
      ],
    });
  });

  it('opens remotes/:remoteId on the remote details', () => {
    const id = '0b6c1b1e-3a52-4d9b-9a5f-2f6d8f1d9a11';

    expect(getStateFromLink(`remotes/${id}`)).toMatchObject({
      routes: [
        {
          name: 'Main',
          state: {
            routes: [
              {
                name: 'Remotes',
                state: {
                  routes: [
                    { name: 'RemoteList' },
                    { name: 'RemoteDetails', params: { remoteId: id } },
                  ],
                },
              },
            ],
          },
        },
      ],
    });
  });

  it('opens devices on the device list', () => {
    expect(getStateFromLink('devices')).toMatchObject({
      routes: [
        {
          name: 'Main',
          state: {
            routes: [
              { name: 'Devices', state: { routes: [{ name: 'DeviceList' }] } },
            ],
          },
        },
      ],
    });
  });

  it('keeps the sign-in paths', () => {
    expect(getStateFromLink('login')).toMatchObject({
      routes: [{ name: 'Auth', state: { routes: [{ name: 'Login' }] } }],
    });
    expect(getStateFromLink('sign-up')).toMatchObject({
      routes: [{ name: 'Auth', state: { routes: [{ name: 'SignUp' }] } }],
    });
  });
});
