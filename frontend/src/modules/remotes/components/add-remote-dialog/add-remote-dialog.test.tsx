import type { QueryClient } from '@tanstack/react-query';

import type { DeviceResponse, RemoteResponse } from '@airremote/contracts';

import type { ApiError } from '@app-types';
import {
  act,
  fireEvent,
  mockViewMeasure,
  openSelect,
  renderWithProviders,
  screen,
} from '@utils/tests';
import { devicesApi } from '@api/devices';
import { remotesApi } from '@api/remotes';
import { createQueryClient } from '@queries/query-client';

import AddRemoteDialog from './add-remote-dialog';

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
const hall: DeviceResponse = {
  id: '0b6a3c1e-2f4d-4e5a-9b8c-7d6e5f4a3b2c',
  macAddress: 'aa:bb:cc:dd:ee:02',
  name: 'Hall',
  online: false,
};
const created: RemoteResponse = {
  id: '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d',
  deviceId: hall.id,
  name: 'Hall heater',
  type: 'heater',
};
const SELECT = 'add-remote.select-option';
const NAME = 'add-remote.name.label';

let queryClient: QueryClient;
let onApiError: jest.Mock;
let onClose: jest.Mock;

beforeEach(() => {
  jest.resetAllMocks();
  mockViewMeasure();
  onApiError = jest.fn();
  onClose = jest.fn();
  // The app's client, with the Error dialog replaced by a mock.
  queryClient = createQueryClient(onApiError);
  queryClient.setDefaultOptions({
    queries: { ...queryClient.getDefaultOptions().queries, gcTime: Infinity },
    mutations: { gcTime: Infinity },
  });
  devices.list.mockResolvedValue([desk, hall]);
  remotes.list.mockResolvedValue([]);
});

afterEach(() => {
  queryClient.clear();
  jest.restoreAllMocks();
});

async function renderDialog() {
  await renderWithProviders(<AddRemoteDialog isOpen onClose={onClose} />, {
    queryClient,
  });
}

function button(name: string) {
  return screen.getByRole('button', { name });
}

async function press(name: string) {
  await act(async () => {
    fireEvent.press(button(name));
  });
}

async function pick(option: string) {
  await openSelect(SELECT);
  await act(async () => {
    fireEvent.press(screen.getByRole('option', { name: option }));
  });
}

async function type(text: string) {
  await act(async () => {
    fireEvent.changeText(screen.getByLabelText(NAME), text);
  });
}

/** Category Heater, then device Hall: the name step. */
async function goToNameStep() {
  await renderDialog();
  await pick('remote-type.heater');
  await press('next');
  await pick('Hall');
  await press('next');
  expect(screen.getByText('add-remote.name.heading')).toBeOnTheScreen();
}

describe('AddRemoteDialog', () => {
  it('starts with the category, offering Close and a disabled Next', async () => {
    await renderDialog();

    expect(
      screen.getByRole('heading', { name: 'add-remote.title' }),
    ).toBeOnTheScreen();
    expect(screen.getByText('add-remote.type.heading')).toBeOnTheScreen();
    expect(screen.getByRole('combobox', { name: SELECT })).toBeOnTheScreen();
    expect(button('close')).toBeOnTheScreen();
    expect(button('next')).toBeDisabled();
    expect(
      screen.queryByRole('button', { name: 'back' }),
    ).not.toBeOnTheScreen();
  });

  it("lists V1's seven categories in V1's order", async () => {
    await renderDialog();

    await openSelect(SELECT);

    expect(
      screen.getAllByRole('option').map((o) => o.props['aria-valuetext']),
    ).toEqual([
      'remote-type.air-conditioner',
      'remote-type.audio-system',
      'remote-type.dehumidifier',
      'remote-type.heater',
      'remote-type.rgb-lights',
      'remote-type.smart-tv',
      'remote-type.generic-device',
    ]);
  });

  it('goes on to the device once a category is picked', async () => {
    await renderDialog();

    await pick('remote-type.heater');
    expect(button('next')).toBeEnabled();
    await press('next');

    expect(screen.getByText('add-remote.device.heading')).toBeOnTheScreen();
    expect(button('next')).toBeDisabled();
    await openSelect(SELECT);
    expect(
      screen.getAllByRole('option').map((o) => o.props['aria-valuetext']),
    ).toEqual(['Desk', 'Hall']);
  });

  it('goes back to the category it keeps', async () => {
    await renderDialog();
    await pick('remote-type.heater');
    await press('next');

    await press('back');

    expect(screen.getByText('add-remote.type.heading')).toBeOnTheScreen();
    expect(screen.getByText('remote-type.heater')).toBeOnTheScreen();
    expect(button('next')).toBeEnabled();
  });

  it('says to add a device first when there is none', async () => {
    devices.list.mockResolvedValue([]);
    await renderDialog();
    await pick('remote-type.heater');

    await press('next');

    expect(await screen.findByText('add-remote.device.none')).toBeOnTheScreen();
    expect(screen.queryByRole('combobox')).not.toBeOnTheScreen();
    expect(button('next')).toBeDisabled();
  });

  it('asks for the name, and creates only a valid one', async () => {
    await goToNameStep();

    expect(button('create')).toBeDisabled();
    expect(
      screen.queryByRole('button', { name: 'next' }),
    ).not.toBeOnTheScreen();
    await type('   ');
    expect(screen.getByText('add-remote.name.invalid')).toBeOnTheScreen();
    expect(button('create')).toBeDisabled();

    await type('a'.repeat(101));
    expect(button('create')).toBeDisabled();
  });

  it('creates the remote on the picked device and closes', async () => {
    remotes.create.mockResolvedValueOnce(created);
    await goToNameStep();

    await type('  Hall heater ');
    expect(button('create')).toBeEnabled();
    await press('create');

    expect(remotes.create).toHaveBeenCalledWith(hall.id, {
      name: 'Hall heater',
      type: 'heater',
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('reports a name the device already has and stays on the name', async () => {
    const taken: ApiError = {
      status: 409,
      code: 'REMOTE_NAME_TAKEN',
      message: 'Taken',
      isNetworkError: false,
    };
    remotes.create.mockRejectedValueOnce(taken);
    await goToNameStep();
    await type('Hall heater');

    await press('create');

    expect(onApiError).toHaveBeenCalledWith(taken, undefined);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByLabelText(NAME)).toHaveDisplayValue('Hall heater');
    expect(button('create')).toBeEnabled();
  });

  it('closes from Close on every step', async () => {
    await goToNameStep();

    await press('close');

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
