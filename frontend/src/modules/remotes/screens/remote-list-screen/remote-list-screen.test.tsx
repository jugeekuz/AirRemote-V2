import { Text } from 'react-native';
import {
  createNavigationContainerRef,
  NavigationContainer,
  useRoute,
  type RouteProp,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { QueryClient } from '@tanstack/react-query';

import type { DeviceResponse, RemoteResponse } from '@airremote/contracts';

import type { ApiError, RemotesStackParamList } from '@app-types';
import {
  act,
  fireEvent,
  mockViewMeasure,
  openSelect,
  renderWithProviders,
  screen,
  waitFor,
} from '@utils/tests';
import { devicesApi } from '@api/devices';
import { remotesApi } from '@api/remotes';
import { createQueryClient } from '@queries/query-client';

import RemoteListScreen from './remote-list-screen';

jest.mock('@api/auth');
jest.mock('@api/devices');
jest.mock('@api/remotes');

const devices = jest.mocked(devicesApi);
const remotes = jest.mocked(remotesApi);
const desk: DeviceResponse = {
  id: '6f1c0d4e-9a43-4c1b-8d4e-2f0a1b2c3d4e',
  macAddress: 'aa:bb:cc:dd:ee:01',
  name: 'Desk',
  online: true,
};
const ac: RemoteResponse = {
  id: '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d',
  deviceId: desk.id,
  name: 'AC',
  type: 'air_conditioner',
};
const tv: RemoteResponse = {
  id: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
  deviceId: desk.id,
  name: 'TV',
  type: 'smart_tv',
};
const DELETE_TV = 'remote-tile.delete | name: TV';
const OPEN_AC =
  'remote-tile.open | name: AC | type: remote-type.air-conditioner | status: status-dot.online';
const OPEN_TV =
  'remote-tile.open | name: TV | type: remote-type.smart-tv | status: status-dot.online';

type TestParamList = {
  RemoteList: undefined;
  RemoteDetails: RemotesStackParamList['RemoteDetails'];
};
const Stack = createNativeStackNavigator<TestParamList>();
const navigation = createNavigationContainerRef<TestParamList>();

function Details() {
  const { params } = useRoute<RouteProp<TestParamList, 'RemoteDetails'>>();
  return <Text>{`details of ${params.remoteId}`}</Text>;
}

let queryClient: QueryClient;
let onApiError: jest.Mock;

beforeEach(() => {
  jest.resetAllMocks();
  mockViewMeasure();
  onApiError = jest.fn();
  // The app's client, with the Error dialog replaced by a mock. Nothing
  // keeps a garbage-collection timer, which would keep Jest running.
  queryClient = createQueryClient(onApiError);
  queryClient.setDefaultOptions({
    queries: { ...queryClient.getDefaultOptions().queries, gcTime: Infinity },
    mutations: { gcTime: Infinity },
  });
  devices.list.mockResolvedValue([desk]);
});

afterEach(() => {
  queryClient.clear();
  jest.restoreAllMocks();
});

/** The Remotes screen in a stack, with the details screen to open. */
async function renderRemotes() {
  await renderWithProviders(
    <NavigationContainer ref={navigation}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="RemoteList" component={RemoteListScreen} />
        <Stack.Screen name="RemoteDetails" component={Details} />
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

describe('RemoteListScreen', () => {
  it("lists the remotes with V1's header, count and notice", async () => {
    remotes.list.mockResolvedValueOnce([ac, tv]);

    await renderRemotes();

    expect(await screen.findByText('AC')).toBeOnTheScreen();
    expect(screen.getByText('TV')).toBeOnTheScreen();
    expect(
      screen.getByRole('header', { name: 'remote-list.heading' }),
    ).toBeOnTheScreen();
    expect(screen.getByText('2')).toBeOnTheScreen();
    expect(screen.getByText('remote-list.notice')).toBeOnTheScreen();
    expect(screen.getByText('remote-type.air-conditioner')).toBeOnTheScreen();
    expect(screen.getByText('remote-type.smart-tv')).toBeOnTheScreen();
    expect(
      await screen.findAllByRole('image', {
        name: 'status-dot.online',
        includeHiddenElements: true,
      }),
    ).toHaveLength(2);
    expect(screen.queryByText('remote-list.empty')).not.toBeOnTheScreen();
    expect(
      screen.getByRole('button', { name: 'top-toolbar.account' }),
    ).toBeOnTheScreen();
  });

  it('counts 0 and shows no empty state while the list loads', async () => {
    remotes.list.mockReturnValueOnce(new Promise(() => {}));

    await renderRemotes();

    expect(screen.getByText('0')).toBeOnTheScreen();
    expect(screen.queryByText('remote-list.empty')).not.toBeOnTheScreen();
  });

  it('says there are no remotes once the list is empty', async () => {
    remotes.list.mockResolvedValueOnce([]);

    await renderRemotes();

    expect(await screen.findByText('remote-list.empty')).toBeOnTheScreen();
    expect(screen.getByText('0')).toBeOnTheScreen();
  });

  it('offers to try again when the first load fails', async () => {
    const offline: ApiError = {
      code: 'NETWORK_ERROR',
      message: 'Network Error',
      isNetworkError: true,
    };
    remotes.list.mockRejectedValueOnce(offline).mockResolvedValueOnce([ac]);
    queryClient.setDefaultOptions({
      ...queryClient.getDefaultOptions(),
      queries: { ...queryClient.getDefaultOptions().queries, retry: false },
    });

    await renderRemotes();

    expect(
      await screen.findByText('remote-list.load-failed'),
    ).toBeOnTheScreen();
    expect(onApiError).toHaveBeenCalledWith(offline, undefined);
    expect(screen.queryByText('remote-list.empty')).not.toBeOnTheScreen();

    await press('try-again');

    expect(await screen.findByText('AC')).toBeOnTheScreen();
    expect(screen.queryByText('remote-list.load-failed')).not.toBeOnTheScreen();
  });

  it('opens a remote by its id', async () => {
    remotes.list.mockResolvedValue([ac, tv]);
    await renderRemotes();
    await screen.findByText('TV');

    await press(OPEN_TV);

    expect(await screen.findByText(`details of ${tv.id}`)).toBeOnTheScreen();
  });

  it('deletes a remote in edit mode after the confirmation', async () => {
    remotes.list.mockResolvedValueOnce([ac, tv]).mockResolvedValueOnce([ac]);
    remotes.delete.mockResolvedValueOnce(undefined);
    await renderRemotes();
    await screen.findByText('TV');
    expect(
      screen.queryByRole('button', { name: DELETE_TV }),
    ).not.toBeOnTheScreen();

    await press('edit');
    await press(DELETE_TV);
    expect(screen.getByText('confirm.delete')).toBeOnTheScreen();
    await press('yes');

    await waitFor(() => {
      expect(screen.queryByText('TV')).not.toBeOnTheScreen();
    });
    expect(remotes.delete).toHaveBeenCalledWith(tv.id);
    expect(screen.getByText('AC')).toBeOnTheScreen();
    expect(screen.getByText('1')).toBeOnTheScreen();
  });

  it('keeps the remote and shows the error when the delete fails', async () => {
    const offline: ApiError = {
      code: 'NETWORK_ERROR',
      message: 'Network Error',
      isNetworkError: true,
    };
    remotes.list.mockResolvedValue([ac, tv]);
    remotes.delete.mockRejectedValueOnce(offline);
    await renderRemotes();
    await screen.findByText('TV');

    await press('edit');
    await press(DELETE_TV);
    await press('yes');

    await waitFor(() => {
      expect(onApiError).toHaveBeenCalledWith(offline, undefined);
    });
    expect(screen.getByText('TV')).toBeOnTheScreen();
  });

  it('leaves edit mode when the user leaves the screen', async () => {
    remotes.list.mockResolvedValue([ac, tv]);
    await renderRemotes();
    await screen.findByText('TV');
    await press('edit');
    expect(screen.getByRole('button', { name: DELETE_TV })).toBeOnTheScreen();

    await press(OPEN_AC);
    await act(async () => {
      navigation.goBack();
    });

    expect(await screen.findByText('TV')).toBeOnTheScreen();
    expect(
      screen.queryByRole('button', { name: DELETE_TV }),
    ).not.toBeOnTheScreen();
  });

  it('asks for the remotes and devices again when the user comes back', async () => {
    remotes.list.mockResolvedValueOnce([ac, tv]).mockResolvedValue([ac]);
    await renderRemotes();
    await screen.findByText('TV');
    await waitFor(() => {
      expect(devices.list).toHaveBeenCalledTimes(1);
    });

    await press(OPEN_AC);
    await act(async () => {
      navigation.goBack();
    });

    await waitFor(() => {
      expect(screen.queryByText('TV')).not.toBeOnTheScreen();
    });
    expect(remotes.list).toHaveBeenCalledTimes(2);
    expect(devices.list).toHaveBeenCalledTimes(2);
  });

  it('adds a remote through the dialog, which closes and lists it', async () => {
    remotes.list.mockResolvedValueOnce([]).mockResolvedValue([ac]);
    remotes.create.mockResolvedValueOnce(ac);
    await renderRemotes();
    await screen.findByText('remote-list.empty');

    await press('add');
    expect(
      screen.getByRole('heading', { name: 'add-remote.title' }),
    ).toBeOnTheScreen();
    await openSelect('add-remote.type.heading');
    await act(async () => {
      fireEvent.press(
        screen.getByRole('option', { name: 'remote-type.air-conditioner' }),
      );
    });
    await press('next');
    await openSelect('add-remote.device.heading');
    await act(async () => {
      fireEvent.press(screen.getByRole('option', { name: 'Desk' }));
    });
    await press('next');
    await act(async () => {
      fireEvent.changeText(
        screen.getByLabelText('add-remote.name.label'),
        'AC',
      );
    });
    await press('create');

    expect(await screen.findByText('AC')).toBeOnTheScreen();
    expect(remotes.create).toHaveBeenCalledWith(desk.id, {
      name: 'AC',
      type: 'air_conditioner',
    });
    expect(screen.queryByText('add-remote.title')).not.toBeOnTheScreen();
    expect(screen.getByText('1')).toBeOnTheScreen();
  });
});
