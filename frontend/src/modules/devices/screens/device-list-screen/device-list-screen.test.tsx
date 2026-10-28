import { Text } from 'react-native';
import {
  createNavigationContainerRef,
  NavigationContainer,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { onlineManager, type QueryClient } from '@tanstack/react-query';

import type { DeviceResponse } from '@airremote/contracts';

import type { ApiError, DevicesStackParamList } from '@app-types';
import {
  act,
  fireEvent,
  mockViewMeasure,
  renderWithProviders,
  screen,
  waitFor,
} from '@utils/tests';
import { devicesApi } from '@api/devices';
import { createQueryClient } from '@queries/query-client';
import { pendingPairingStore } from '@stores/pending-pairing';

import DeviceListScreen from './device-list-screen';

jest.mock('@api/auth');
jest.mock('@api/devices');

const api = jest.mocked(devicesApi);
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
const DELETE_HALL = 'device-tile.delete | name: Hall';
const PAIR_PARAMS = { pairMac: 'aa:bb:cc:dd:ee:01', pairCode: '7k4m-q9tx' };
const PREFILLED =
  'add-device.name.device | macAddress: AA:BB:CC:DD:EE:01 | pairingCode: 7K4M-Q9TX';

type TestParamList = {
  DeviceList: DevicesStackParamList['DeviceList'];
  Elsewhere: undefined;
};
const Stack = createNativeStackNavigator<TestParamList>();
const navigation = createNavigationContainerRef<TestParamList>();

function Elsewhere() {
  return <Text>elsewhere</Text>;
}

let queryClient: QueryClient;
let onApiError: jest.Mock;

beforeEach(() => {
  jest.resetAllMocks();
  pendingPairingStore.reset();
  mockViewMeasure();
  onApiError = jest.fn();
  // The app's client, with the Error dialog replaced by a mock. Nothing
  // keeps a garbage-collection timer, which would keep Jest running.
  queryClient = createQueryClient(onApiError);
  queryClient.setDefaultOptions({
    queries: { ...queryClient.getDefaultOptions().queries, gcTime: Infinity },
    mutations: { gcTime: Infinity },
  });
});

afterEach(() => {
  onlineManager.setOnline(true);
  queryClient.clear();
  jest.restoreAllMocks();
});

/** The Devices screen in a stack, with another screen to navigate to. */
async function renderDevices(
  initialParams?: DevicesStackParamList['DeviceList'],
) {
  await renderWithProviders(
    <NavigationContainer ref={navigation}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen
          name="DeviceList"
          component={DeviceListScreen}
          initialParams={initialParams}
        />
        <Stack.Screen name="Elsewhere" component={Elsewhere} />
      </Stack.Navigator>
    </NavigationContainer>,
    { queryClient },
  );
}

async function press(name: string) {
  await act(async () => {
    fireEvent.press(screen.getByRole('button', { name }));
  });
}

describe('DeviceListScreen', () => {
  it("lists the devices with V1's header, count and notice", async () => {
    api.list.mockResolvedValueOnce([desk, hall]);

    await renderDevices();

    expect(await screen.findByText('Desk')).toBeOnTheScreen();
    expect(screen.getByText('Hall')).toBeOnTheScreen();
    expect(
      screen.getByRole('header', { name: 'device-list.heading' }),
    ).toBeOnTheScreen();
    expect(screen.getByText('2')).toBeOnTheScreen();
    expect(screen.getByText('device-list.notice')).toBeOnTheScreen();
    expect(screen.getByText('device-tile.online')).toBeOnTheScreen();
    expect(screen.getByText('device-tile.offline')).toBeOnTheScreen();
    expect(screen.queryByText('device-list.empty')).not.toBeOnTheScreen();
    expect(
      screen.getByRole('button', { name: 'top-toolbar.account' }),
    ).toBeOnTheScreen();
  });

  it('counts 0 and shows no empty state while the list loads', async () => {
    api.list.mockReturnValueOnce(new Promise(() => {}));

    await renderDevices();

    expect(screen.getByText('0')).toBeOnTheScreen();
    expect(screen.queryByText('device-list.empty')).not.toBeOnTheScreen();
  });

  // The first load waits for the network; the page says so, then loads.
  it('says it is offline in place of the tiles, and loads once back online', async () => {
    onlineManager.setOnline(false);
    api.list.mockResolvedValue([desk]);

    await renderDevices();

    expect(screen.getByText('empty-tiles.offline')).toBeOnTheScreen();
    expect(screen.queryByText('device-list.empty')).not.toBeOnTheScreen();

    await act(async () => {
      onlineManager.setOnline(true);
    });

    expect(await screen.findByText('Desk')).toBeOnTheScreen();
    expect(screen.queryByText('empty-tiles.offline')).not.toBeOnTheScreen();
  });

  it('says there are no devices once the list is empty', async () => {
    api.list.mockResolvedValueOnce([]);

    await renderDevices();

    expect(await screen.findByText('device-list.empty')).toBeOnTheScreen();
    expect(screen.getByText('0')).toBeOnTheScreen();
  });

  it('offers to try again when the first load fails', async () => {
    const offline: ApiError = {
      code: 'NETWORK_ERROR',
      message: 'Network Error',
      isNetworkError: true,
    };
    api.list.mockRejectedValueOnce(offline).mockResolvedValueOnce([desk]);
    queryClient.setDefaultOptions({
      ...queryClient.getDefaultOptions(),
      queries: { ...queryClient.getDefaultOptions().queries, retry: false },
    });

    await renderDevices();

    expect(
      await screen.findByText('device-list.load-failed'),
    ).toBeOnTheScreen();
    expect(onApiError).toHaveBeenCalledWith(offline, undefined);
    expect(screen.queryByText('device-list.empty')).not.toBeOnTheScreen();

    await press('try-again');

    expect(await screen.findByText('Desk')).toBeOnTheScreen();
    expect(screen.queryByText('device-list.load-failed')).not.toBeOnTheScreen();
  });

  it('deletes a device in edit mode after the confirmation', async () => {
    api.list.mockResolvedValueOnce([desk, hall]).mockResolvedValueOnce([desk]);
    api.delete.mockResolvedValueOnce(undefined);
    await renderDevices();
    await screen.findByText('Hall');
    expect(
      screen.queryByRole('button', { name: DELETE_HALL }),
    ).not.toBeOnTheScreen();

    await press('edit');
    await press(DELETE_HALL);
    expect(screen.getByText('confirm.delete')).toBeOnTheScreen();
    await press('yes');

    await waitFor(() => {
      expect(screen.queryByText('Hall')).not.toBeOnTheScreen();
    });
    expect(api.delete).toHaveBeenCalledWith(hall.id);
    expect(screen.getByText('Desk')).toBeOnTheScreen();
    expect(screen.getByText('1')).toBeOnTheScreen();
  });

  it('keeps the device and shows the error when the delete fails', async () => {
    const offline: ApiError = {
      code: 'NETWORK_ERROR',
      message: 'Network Error',
      isNetworkError: true,
    };
    api.list.mockResolvedValue([desk, hall]);
    api.delete.mockRejectedValueOnce(offline);
    await renderDevices();
    await screen.findByText('Hall');

    await press('edit');
    await press(DELETE_HALL);
    await press('yes');

    await waitFor(() => {
      expect(onApiError).toHaveBeenCalledWith(offline, undefined);
    });
    expect(screen.getByText('Hall')).toBeOnTheScreen();
  });

  it('does not delete when the user answers No', async () => {
    api.list.mockResolvedValue([desk, hall]);
    await renderDevices();
    await screen.findByText('Hall');

    await press('edit');
    await press(DELETE_HALL);
    await press('no');

    expect(api.delete).not.toHaveBeenCalled();
    expect(screen.getByText('Hall')).toBeOnTheScreen();
  });

  it('leaves edit mode when the user leaves the screen', async () => {
    api.list.mockResolvedValue([desk, hall]);
    await renderDevices();
    await screen.findByText('Hall');
    await press('edit');
    expect(screen.getByRole('button', { name: DELETE_HALL })).toBeOnTheScreen();

    await act(async () => {
      navigation.navigate('Elsewhere');
    });
    await act(async () => {
      navigation.goBack();
    });

    expect(await screen.findByText('Hall')).toBeOnTheScreen();
    expect(
      screen.queryByRole('button', { name: DELETE_HALL }),
    ).not.toBeOnTheScreen();
  });

  it('asks for the list again when the user comes back', async () => {
    api.list.mockResolvedValueOnce([desk, hall]).mockResolvedValue([desk]);
    await renderDevices();
    await screen.findByText('Hall');

    await act(async () => {
      navigation.navigate('Elsewhere');
    });
    await act(async () => {
      navigation.goBack();
    });

    await waitFor(() => {
      expect(screen.queryByText('Hall')).not.toBeOnTheScreen();
    });
    expect(api.list).toHaveBeenCalledTimes(2);
  });

  describe('adding a device', () => {
    const added: DeviceResponse = {
      id: '3d2c1b0a-9f8e-4d7c-8b6a-5f4e3d2c1b0a',
      macAddress: 'aa:bb:cc:dd:ee:01',
      name: 'Living room',
      online: false,
    };

    it('opens the Add device dialog from the add button', async () => {
      api.list.mockResolvedValue([]);
      await renderDevices();
      await screen.findByText('device-list.empty');

      await press('add');

      expect(
        screen.getByRole('heading', { name: 'add-device.title' }),
      ).toBeOnTheScreen();
      expect(
        screen.getByText('add-device.instructions.heading'),
      ).toBeOnTheScreen();
    });

    it('enrolls it, closes the dialog and lists it', async () => {
      api.list.mockResolvedValueOnce([]).mockResolvedValue([added]);
      api.enroll.mockResolvedValueOnce(added);
      await renderDevices(PAIR_PARAMS);
      await screen.findByText(PREFILLED);

      await act(async () => {
        fireEvent.changeText(
          screen.getByLabelText('add-device.name.label'),
          'Living room',
        );
      });
      await press('finish');

      expect(await screen.findByText('Living room')).toBeOnTheScreen();
      expect(screen.queryByText('add-device.title')).not.toBeOnTheScreen();
      expect(screen.getByText('1')).toBeOnTheScreen();
    });

    it('opens a pairing link at the name, filled in, and clears the link on close', async () => {
      api.list.mockResolvedValue([]);

      await renderDevices(PAIR_PARAMS);

      expect(await screen.findByText(PREFILLED)).toBeOnTheScreen();
      expect(navigation.getCurrentRoute()?.params).toEqual(PAIR_PARAMS);

      await press('close');

      expect(screen.queryByText(PREFILLED)).not.toBeOnTheScreen();
      expect(navigation.getCurrentRoute()?.params).toEqual({
        pairMac: undefined,
        pairCode: undefined,
      });
    });

    it('opens a pairing link that arrived before sign-in', async () => {
      api.list.mockResolvedValue([]);
      pendingPairingStore.set({
        macAddress: 'AA:BB:CC:DD:EE:01',
        pairingCode: '7K4MQ9TX',
      });

      await renderDevices();

      expect(await screen.findByText(PREFILLED)).toBeOnTheScreen();
      expect(pendingPairingStore.getPending()).toBeNull();
    });
  });
});
