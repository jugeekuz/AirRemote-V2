import { authStore } from '@stores/auth';
import { pendingPairingStore } from '@stores/pending-pairing';

import { getStateFromLink } from './linking';

const PAIR_LINK = 'pair?mac=aa:bb:cc:dd:ee:01&code=7k4m-q9tx';
const PAIRING = { macAddress: 'AA:BB:CC:DD:EE:01', pairingCode: '7K4MQ9TX' };

beforeEach(() => {
  authStore.reset();
  pendingPairingStore.reset();
});

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

  describe('a pairing link before sign-in', () => {
    it('is kept for after sign-in when there is no session', () => {
      authStore.signOut();

      getStateFromLink(PAIR_LINK);

      expect(pendingPairingStore.getPending()).toEqual(PAIRING);
    });

    it('is kept while the session is still being restored', () => {
      getStateFromLink(PAIR_LINK);

      expect(pendingPairingStore.getPending()).toEqual(PAIRING);
    });

    it('is not kept when signed in: the device list gets it', () => {
      authStore.signIn('token-1');

      getStateFromLink(PAIR_LINK);

      expect(pendingPairingStore.getPending()).toBeNull();
    });

    it('is not kept when it is not a valid pairing', () => {
      authStore.signOut();

      getStateFromLink('pair?mac=aa:bb&code=7K4MQ9TX');
      getStateFromLink('devices');

      expect(pendingPairingStore.getPending()).toBeNull();
    });
  });
});
