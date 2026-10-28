import { Text } from 'react-native';
import {
  createNavigationContainerRef,
  NavigationContainer,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { QueryClient } from '@tanstack/react-query';

import type {
  ButtonResponse,
  DeviceResponse,
  RemoteResponse,
} from '@airremote/contracts';

import type { ApiError, RemotesStackParamList } from '@app-types';
import {
  act,
  fireEvent,
  mockViewMeasure,
  renderWithProviders,
  screen,
  waitFor,
} from '@utils/tests';
import { buttonsApi } from '@api/buttons';
import { deviceCommandsApi } from '@api/device-commands';
import { devicesApi } from '@api/devices';
import { remotesApi } from '@api/remotes';
import { createQueryClient } from '@queries/query-client';

import RemoteDetailsScreen from './remote-details-screen';

jest.mock('@api/auth');
jest.mock('@api/buttons');
jest.mock('@api/device-commands');
jest.mock('@api/devices');
jest.mock('@api/remotes');

const buttons = jest.mocked(buttonsApi);
const commands = jest.mocked(deviceCommandsApi);
const devices = jest.mocked(devicesApi);
const remotes = jest.mocked(remotesApi);
const desk: DeviceResponse = {
  id: '6f1c0d4e-9a43-4c1b-8d4e-2f0a1b2c3d4e',
  macAddress: 'aa:bb:cc:dd:ee:01',
  name: 'Desk ESP32',
  online: true,
};
const ac: RemoteResponse = {
  id: '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d',
  deviceId: desk.id,
  name: 'Living Room AC',
  type: 'air_conditioner',
};
const power: ButtonResponse = {
  id: '3c2b1a09-8f7e-4d6c-9b5a-4f3e2d1c0b9a',
  remoteId: ac.id,
  name: 'Power',
};
const swing: ButtonResponse = {
  id: '4d3c2b1a-0f9e-4d8c-8b7a-6f5e4d3c2b1a',
  remoteId: ac.id,
  name: 'Swing',
};
const DELETE_SWING = 'button-tile.delete | name: Swing';
const offline: ApiError = {
  code: 'NETWORK_ERROR',
  message: 'Network Error',
  isNetworkError: true,
};

type TestParamList = RemotesStackParamList & { Elsewhere: undefined };
const Stack = createNativeStackNavigator<TestParamList>();
const navigation = createNavigationContainerRef<TestParamList>();

function RemoteList() {
  return <Text>the remote list</Text>;
}

function Elsewhere() {
  return <Text>elsewhere</Text>;
}

let queryClient: QueryClient;
let onApiError: jest.Mock;

beforeEach(() => {
  jest.resetAllMocks();
  mockViewMeasure();
  onApiError = jest.fn();
  queryClient = createQueryClient(onApiError);
  queryClient.setDefaultOptions({
    queries: {
      ...queryClient.getDefaultOptions().queries,
      retry: false,
      gcTime: Infinity,
    },
    mutations: { gcTime: Infinity },
  });
  devices.list.mockResolvedValue([desk]);
  remotes.list.mockResolvedValue([ac]);
  buttons.list.mockResolvedValue([power, swing]);
});

afterEach(() => {
  queryClient.clear();
  jest.restoreAllMocks();
});

/**
 * Remote details over the remote list, as a tile or a link opens it (the
 * app's linking puts the list under a linked remote too).
 */
async function renderDetails(remoteId = ac.id) {
  await renderWithProviders(
    <NavigationContainer ref={navigation}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="RemoteList" component={RemoteList} />
        <Stack.Screen name="RemoteDetails" component={RemoteDetailsScreen} />
        <Stack.Screen name="Elsewhere" component={Elsewhere} />
      </Stack.Navigator>
    </NavigationContainer>,
    { queryClient },
  );
  await act(async () => {
    navigation.navigate('RemoteDetails', { remoteId });
  });
}

async function press(name: string) {
  await act(async () => {
    fireEvent.press(screen.getByRole('button', { name }));
  });
}

/** Leaves for another screen and comes back, as the user would. */
async function leaveAndComeBack() {
  await act(async () => {
    navigation.navigate('Elsewhere');
  });
  await act(async () => {
    navigation.goBack();
  });
}

describe('RemoteDetailsScreen', () => {
  it("shows V1's info card and the remote's buttons", async () => {
    await renderDetails();

    expect(await screen.findByText('Swing')).toBeOnTheScreen();
    expect(screen.getByText('Power')).toBeOnTheScreen();
    expect(screen.getByText('Living Room AC')).toBeOnTheScreen();
    expect(screen.getByText('remote-type.air-conditioner')).toBeOnTheScreen();
    expect(screen.getByText('Desk ESP32')).toBeOnTheScreen();
    expect(screen.getByText('AA:BB:CC:DD:EE:01')).toBeOnTheScreen();
    expect(screen.getByText('info-bar.online')).toBeOnTheScreen();
    expect(
      screen.getByRole('header', { name: 'remote-details.heading' }),
    ).toBeOnTheScreen();
    expect(screen.getByText('2')).toBeOnTheScreen();
    expect(
      screen.getByRole('button', { name: 'press-button.label | name: Power' }),
    ).toBeOnTheScreen();
    expect(buttons.list).toHaveBeenCalledWith(ac.id, expect.anything());
  });

  it("shows V1's Loading.. and no count while it loads", async () => {
    remotes.list.mockReturnValue(new Promise(() => {}));
    devices.list.mockReturnValue(new Promise(() => {}));

    await renderDetails();

    expect(screen.getAllByText('info-bar.loading')).toHaveLength(5);
    expect(screen.queryByText('remote-details.empty')).not.toBeOnTheScreen();
    expect(
      screen.queryByText('remote-details.not-found'),
    ).not.toBeOnTheScreen();
  });

  it('says there are no buttons once the list is empty', async () => {
    buttons.list.mockResolvedValue([]);

    await renderDetails();

    expect(await screen.findByText('remote-details.empty')).toBeOnTheScreen();
    expect(screen.getByText('0')).toBeOnTheScreen();
  });

  it('goes back from the toolbar', async () => {
    await renderDetails();
    await screen.findByText('Swing');

    await press('top-toolbar.back');

    expect(await screen.findByText('the remote list')).toBeOnTheScreen();
  });

  // A link to an id that never was a remote.
  it("says the remote doesn't exist and offers the way back", async () => {
    await renderDetails('5b4a3c2d-1e0f-4a9b-8c7d-6e5f4a3b2c1d');

    expect(
      await screen.findByText('remote-details.not-found'),
    ).toBeOnTheScreen();
    expect(buttons.list).not.toHaveBeenCalled();
    expect(onApiError).not.toHaveBeenCalled();

    await press('remote-details.back-to-remotes');

    expect(await screen.findByText('the remote list')).toBeOnTheScreen();
  });

  // Review focus 3: deleted while its details were open.
  it("says the remote doesn't exist after it was deleted meanwhile", async () => {
    await renderDetails();
    await screen.findByText('Swing');
    remotes.list.mockResolvedValue([]);

    await leaveAndComeBack();

    expect(
      await screen.findByText('remote-details.not-found'),
    ).toBeOnTheScreen();
    expect(screen.queryByText('Swing')).not.toBeOnTheScreen();
    expect(onApiError).not.toHaveBeenCalled();
  });

  // Review focus 3: its device was deleted (on the Devices tab).
  it("says the remote doesn't exist once its device was deleted", async () => {
    await renderDetails();
    await screen.findByText('Swing');
    devices.list.mockResolvedValue([]);
    remotes.list.mockResolvedValue([]);
    buttons.list.mockRejectedValue({
      status: 404,
      code: 'NOT_FOUND',
      message: 'Not found',
      isNetworkError: false,
    } satisfies ApiError);

    // What deleting the device does to the cache.
    await act(async () => {
      await queryClient.invalidateQueries();
    });

    expect(
      await screen.findByText('remote-details.not-found'),
    ).toBeOnTheScreen();
    expect(onApiError).not.toHaveBeenCalled();
  });

  it('offers to try again when the buttons failed to load', async () => {
    buttons.list.mockRejectedValueOnce(offline);

    await renderDetails();

    expect(
      await screen.findByText('remote-details.load-failed'),
    ).toBeOnTheScreen();
    expect(onApiError).toHaveBeenCalledWith(offline, undefined);

    await press('try-again');

    expect(await screen.findByText('Swing')).toBeOnTheScreen();
    expect(
      screen.queryByText('remote-details.load-failed'),
    ).not.toBeOnTheScreen();
  });

  it('says the remote failed to load, not its buttons, and offers to try again', async () => {
    remotes.list.mockRejectedValueOnce(offline);

    await renderDetails();

    expect(
      await screen.findByText('remote-details.remote-load-failed'),
    ).toBeOnTheScreen();
    expect(
      screen.queryByText('remote-details.load-failed'),
    ).not.toBeOnTheScreen();

    await press('try-again');

    expect(await screen.findByText('Swing')).toBeOnTheScreen();
  });

  it('deletes a button in edit mode after the confirmation', async () => {
    buttons.delete.mockResolvedValueOnce(undefined);
    await renderDetails();
    await screen.findByText('Swing');
    expect(
      screen.queryByRole('button', { name: DELETE_SWING }),
    ).not.toBeOnTheScreen();
    buttons.list.mockResolvedValue([power]);

    await press('edit');
    await press(DELETE_SWING);
    await press('yes');

    await waitFor(() => {
      expect(screen.queryByText('Swing')).not.toBeOnTheScreen();
    });
    expect(buttons.delete).toHaveBeenCalledWith(swing.id);
    expect(screen.getByText('1')).toBeOnTheScreen();
  });

  it('leaves edit mode when the user leaves the screen', async () => {
    await renderDetails();
    await screen.findByText('Swing');
    await press('edit');
    expect(
      screen.getByRole('button', { name: DELETE_SWING }),
    ).toBeOnTheScreen();

    await leaveAndComeBack();

    expect(await screen.findByText('Swing')).toBeOnTheScreen();
    expect(
      screen.queryByRole('button', { name: DELETE_SWING }),
    ).not.toBeOnTheScreen();
  });

  it('presses a button from its tile', async () => {
    buttons.press.mockReturnValue(new Promise(() => {}));
    await renderDetails();
    await screen.findByText('Power');

    await press('press-button.label | name: Power');

    expect(buttons.press).toHaveBeenCalledWith(power.id);
  });

  it('learns a button through the Add Button dialog, which closes and lists it', async () => {
    const learnt: ButtonResponse = {
      id: '5e4d3c2b-1a0f-4e9d-8c7b-6a5f4e3d2c1b',
      remoteId: ac.id,
      name: 'Turbo',
    };
    buttons.learn.mockResolvedValue({
      id: '0f9e8d7c-6b5a-4f3e-9d2c-1b0a9f8e7d6c',
      kind: 'learn_button',
      status: 'pending',
      createdAt: '2026-10-28T10:00:00.000Z',
      expiresAt: '2026-10-28T10:00:20.000Z',
    });
    commands.get.mockResolvedValue({
      id: '0f9e8d7c-6b5a-4f3e-9d2c-1b0a9f8e7d6c',
      kind: 'learn_button',
      status: 'succeeded',
      createdAt: '2026-10-28T10:00:00.000Z',
      expiresAt: '2026-10-28T10:00:20.000Z',
      button: learnt,
    });
    await renderDetails();
    await screen.findByText('Swing');
    buttons.list.mockResolvedValue([power, swing, learnt]);

    await press('add');
    expect(
      screen.getByRole('heading', { name: 'learn-button.title' }),
    ).toBeOnTheScreen();
    await act(async () => {
      fireEvent.changeText(
        screen.getByLabelText('learn-button.name.label'),
        'Turbo',
      );
    });
    await press('next');
    await press('next');

    expect(await screen.findByText('Turbo')).toBeOnTheScreen();
    expect(buttons.learn).toHaveBeenCalledWith(ac.id, { name: 'Turbo' });
    await waitFor(() => {
      expect(
        screen.queryByText('learn-button.listening'),
      ).not.toBeOnTheScreen();
    });
    expect(screen.getByText('3')).toBeOnTheScreen();
  });
});
