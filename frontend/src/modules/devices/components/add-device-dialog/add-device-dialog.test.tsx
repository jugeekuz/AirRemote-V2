import type { QueryClient } from '@tanstack/react-query';

import type { DeviceResponse } from '@airremote/contracts';

import type { ApiError, PairingDetails } from '@app-types';
import { act, fireEvent, renderWithProviders, screen } from '@utils/tests';
import { devicesApi } from '@api/devices';
import { createQueryClient } from '@queries/query-client';
import { CAMERA_VIEW_TEST_ID, cameraMock } from '@mocks/expo-camera.mock';

import AddDeviceDialog from './add-device-dialog';

jest.mock('@api/devices');

const api = jest.mocked(devicesApi);
const MAC = 'AA:BB:CC:DD:EE:01';
const LINK = `airremote://pair?mac=${MAC}&code=7K4MQ9TX`;
const PAIRING: PairingDetails = { macAddress: MAC, pairingCode: '7K4MQ9TX' };
const PREFILLED =
  'add-device.name.device | macAddress: AA:BB:CC:DD:EE:01 | pairingCode: 7K4M-Q9TX';
const DEVICE: DeviceResponse = {
  id: '6f1c0d4e-9a43-4c1b-8d4e-2f0a1b2c3d4e',
  macAddress: 'aa:bb:cc:dd:ee:01',
  name: 'Living room',
  online: false,
};

let queryClient: QueryClient;
let onApiError: jest.Mock;
let onClose: jest.Mock;

beforeEach(() => {
  jest.resetAllMocks();
  cameraMock.reset();
  onApiError = jest.fn();
  onClose = jest.fn();
  // The app's client, with the Error dialog replaced by a mock.
  queryClient = createQueryClient(onApiError);
  queryClient.setDefaultOptions({
    queries: { ...queryClient.getDefaultOptions().queries, gcTime: Infinity },
    mutations: { gcTime: Infinity },
  });
  api.list.mockResolvedValue([]);
});

afterEach(() => {
  queryClient.clear();
});

async function renderDialog(pairing: PairingDetails | null = null) {
  await renderWithProviders(
    <AddDeviceDialog isOpen pairing={pairing} onClose={onClose} />,
    { queryClient },
  );
}

async function press(name: string) {
  await act(async () => {
    fireEvent.press(screen.getByRole('button', { name }));
  });
}

async function type(label: string, text: string) {
  await act(async () => {
    fireEvent.changeText(screen.getByLabelText(label), text);
  });
}

async function blur(label: string) {
  await act(async () => {
    fireEvent(screen.getByLabelText(label), 'blur');
  });
}

async function scan(data: string) {
  await act(async () => {
    fireEvent(screen.getByTestId(CAMERA_VIEW_TEST_ID), 'barcodeScanned', {
      type: 'qr',
      data,
    });
  });
}

async function goToCodeStep() {
  await renderDialog();
  await press('next');
  expect(await screen.findByRole('button', { name: 'back' })).toBeOnTheScreen();
}

describe('AddDeviceDialog', () => {
  it('starts with how to get a code, under "Add device"', async () => {
    await renderDialog();

    expect(
      screen.getByRole('heading', { name: 'add-device.title' }),
    ).toBeOnTheScreen();
    expect(
      screen.getByText('add-device.instructions.heading'),
    ).toBeOnTheScreen();
    expect(screen.getByText('add-device.instructions.pair')).toBeOnTheScreen();
    expect(
      screen.getByText('add-device.instructions.simulator'),
    ).toBeOnTheScreen();
    expect(
      screen.queryByRole('button', { name: 'back' }),
    ).not.toBeOnTheScreen();

    await press('close');

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('scans the QR code, then asks for the name', async () => {
    await goToCodeStep();
    expect(screen.getByRole('button', { name: 'next' })).toBeDisabled();

    await scan(LINK);

    expect(screen.getByText('add-device.name.heading')).toBeOnTheScreen();
    expect(screen.getByText(PREFILLED)).toBeOnTheScreen();
  });

  it('stays on the scan with a message after a code that is not a pairing link', async () => {
    await goToCodeStep();

    await scan('https://example.com');

    expect(screen.getByText('add-device.code.invalid-scan')).toBeOnTheScreen();
    expect(screen.getByTestId(CAMERA_VIEW_TEST_ID)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'next' })).toBeDisabled();

    await scan(LINK);

    expect(screen.getByText('add-device.name.heading')).toBeOnTheScreen();
  });

  it('takes the MAC address and code typed by hand, normalised', async () => {
    await goToCodeStep();

    await act(async () => {
      fireEvent(
        screen.getByRole('switch', { name: 'add-device.code.enter-manually' }),
        'press',
      );
    });
    expect(screen.queryByTestId(CAMERA_VIEW_TEST_ID)).not.toBeOnTheScreen();
    await type('add-device.code.mac-address', 'aabbccddee01');
    await type('add-device.code.pairing-code', '7k4mq9tx');

    expect(
      screen.getByLabelText('add-device.code.mac-address'),
    ).toHaveDisplayValue(MAC);
    expect(
      screen.getByLabelText('add-device.code.pairing-code'),
    ).toHaveDisplayValue('7K4M-Q9TX');
    await press('next');

    expect(screen.getByText(PREFILLED)).toBeOnTheScreen();
  });

  it('says which typed value is wrong once the field is left', async () => {
    await goToCodeStep();
    await act(async () => {
      fireEvent(
        screen.getByRole('switch', { name: 'add-device.code.enter-manually' }),
        'press',
      );
    });

    await type('add-device.code.mac-address', 'AA:BB');
    await type('add-device.code.pairing-code', '7K4M');
    expect(
      screen.queryByText('add-device.code.mac-address-invalid'),
    ).not.toBeOnTheScreen();
    await blur('add-device.code.mac-address');
    await blur('add-device.code.pairing-code');

    expect(
      screen.getByText('add-device.code.mac-address-invalid'),
    ).toBeOnTheScreen();
    expect(
      screen.getByText('add-device.code.pairing-code-invalid'),
    ).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'next' })).toBeDisabled();
  });

  it('offers only manual entry without a camera (a browser without one)', async () => {
    cameraMock.setAvailable(false);

    await goToCodeStep();

    expect(
      await screen.findByLabelText('add-device.code.mac-address'),
    ).toBeOnTheScreen();
    expect(screen.queryByRole('switch')).not.toBeOnTheScreen();
    expect(screen.queryByTestId(CAMERA_VIEW_TEST_ID)).not.toBeOnTheScreen();
  });

  it('asks for the camera before scanning', async () => {
    cameraMock.setPermission('undetermined');
    await goToCodeStep();
    expect(
      await screen.findByText('add-device.code.camera-needed'),
    ).toBeOnTheScreen();

    await press('add-device.code.allow-camera');

    expect(screen.getByTestId(CAMERA_VIEW_TEST_ID)).toBeOnTheScreen();
  });

  it('says the camera is turned off when it may not be asked again', async () => {
    cameraMock.setPermission('denied', false);

    await goToCodeStep();

    expect(
      await screen.findByText('add-device.code.camera-denied'),
    ).toBeOnTheScreen();
    expect(
      screen.getByRole('switch', { name: 'add-device.code.enter-manually' }),
    ).toBeOnTheScreen();
  });

  it('enrolls the device with its name and closes', async () => {
    api.enroll.mockResolvedValueOnce(DEVICE);
    await renderDialog(PAIRING);
    expect(screen.getByRole('button', { name: 'finish' })).toBeDisabled();

    await type('add-device.name.label', '  Living room ');
    await press('finish');

    expect(api.enroll).toHaveBeenCalledWith({
      macAddress: MAC,
      pairingCode: '7K4MQ9TX',
      name: 'Living room',
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('wants a name that is not blank', async () => {
    await renderDialog(PAIRING);

    expect(screen.queryByText('add-device.name.invalid')).not.toBeOnTheScreen();

    await type('add-device.name.label', '   ');

    expect(screen.getByText('add-device.name.invalid')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'finish' })).toBeDisabled();
  });

  it.each(['INVALID_PAIRING_CODE', 'DEVICE_ALREADY_REGISTERED'] as const)(
    'shows %s in the Error dialog and stays on the name to go back',
    async (code) => {
      const error: ApiError = {
        status: code === 'INVALID_PAIRING_CODE' ? 400 : 409,
        code,
        message: code,
        isNetworkError: false,
      };
      api.enroll.mockRejectedValueOnce(error);
      await renderDialog(PAIRING);
      await type('add-device.name.label', 'Living room');

      await press('finish');

      expect(onApiError).toHaveBeenCalledWith(error, undefined);
      expect(onClose).not.toHaveBeenCalled();
      expect(screen.getByLabelText('add-device.name.label')).toHaveDisplayValue(
        'Living room',
      );

      await press('back');

      expect(screen.getByText('add-device.code.heading')).toBeOnTheScreen();
    },
  );

  it('goes back from the scan to the steps', async () => {
    await goToCodeStep();

    await press('back');

    expect(
      screen.getByText('add-device.instructions.heading'),
    ).toBeOnTheScreen();
  });

  it('starts over at the steps when opened again', async () => {
    const { rerender } = await renderWithProviders(
      <AddDeviceDialog isOpen pairing={null} onClose={onClose} />,
      { queryClient },
    );
    await press('next');

    await rerender(
      <AddDeviceDialog isOpen={false} pairing={null} onClose={onClose} />,
    );
    await rerender(<AddDeviceDialog isOpen pairing={null} onClose={onClose} />);

    expect(
      screen.getByText('add-device.instructions.heading'),
    ).toBeOnTheScreen();
  });
});
