import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react-native';

import { CAMERA_VIEW_TEST_ID, cameraMock } from '@mocks/expo-camera.mock';

import QrScanner from './qr-scanner';
import { QR_SCAN_REPEAT_MS } from './qr-scanner.constants';
import { useCameraAccess } from './use-camera-access';

const LINK = 'airremote://pair?mac=AA:BB:CC:DD:EE:01&code=7K4MQ9TX';

// Native unless a test says otherwise.
let mockIsWeb = false;
jest.mock('@utils/platform', () => ({
  get isWebPlatform() {
    return mockIsWeb;
  },
}));

async function show(data: string) {
  await fireEvent(screen.getByTestId(CAMERA_VIEW_TEST_ID), 'barcodeScanned', {
    type: 'qr',
    data,
  });
}

beforeEach(() => {
  cameraMock.reset();
  mockIsWeb = false;
});

describe('QrScanner', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('films with the back camera, looking for QR codes only', async () => {
    await render(<QrScanner onScan={jest.fn()} label="Camera" />);

    const camera = screen.getByTestId(CAMERA_VIEW_TEST_ID);
    expect(camera).toHaveProp('facing', 'back');
    expect(camera).toHaveProp('barcodeScannerSettings', {
      barcodeTypes: ['qr'],
    });
    expect(screen.getByLabelText('Camera')).toBeOnTheScreen();
  });

  it('reports a code once while it stays in view, and again later', async () => {
    const onScan = jest.fn();
    await render(<QrScanner onScan={onScan} label="Camera" />);

    await show(LINK);
    jest.advanceTimersByTime(QR_SCAN_REPEAT_MS - 1);
    await show(LINK);
    expect(onScan).toHaveBeenCalledTimes(1);
    expect(onScan).toHaveBeenCalledWith(LINK);

    // Still in view: each sighting keeps it quiet.
    jest.advanceTimersByTime(QR_SCAN_REPEAT_MS - 1);
    await show(LINK);
    expect(onScan).toHaveBeenCalledTimes(1);

    // Out of view for a while, then shown again.
    jest.advanceTimersByTime(QR_SCAN_REPEAT_MS);
    await show(LINK);
    expect(onScan).toHaveBeenCalledTimes(2);
  });

  it('says when the camera could not start', async () => {
    const onError = jest.fn();
    await render(
      <QrScanner onScan={jest.fn()} onError={onError} label="Camera" />,
    );

    await fireEvent(screen.getByTestId(CAMERA_VIEW_TEST_ID), 'mountError', {
      message: 'Could not start video source',
    });

    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('reports another code straight away', async () => {
    const onScan = jest.fn();
    await render(<QrScanner onScan={onScan} label="Camera" />);

    await show(LINK);
    await show('hello');

    expect(onScan.mock.calls).toEqual([[LINK], ['hello']]);
  });
});

describe('useCameraAccess', () => {
  it('is granted once the device says the camera may be used', async () => {
    const { result } = await renderHook(() => useCameraAccess());

    await waitFor(() => {
      expect(result.current.access).toBe('granted');
    });
  });

  it('is unavailable without a camera (a browser without one)', async () => {
    cameraMock.setAvailable(false);

    const { result } = await renderHook(() => useCameraAccess());

    await waitFor(() => {
      expect(result.current.access).toBe('unavailable');
    });
  });

  it('asks for the camera, then is granted', async () => {
    cameraMock.setPermission('undetermined');
    const { result } = await renderHook(() => useCameraAccess());
    await waitFor(() => {
      expect(result.current.access).toBe('undetermined');
    });

    await act(async () => {
      result.current.requestAccess();
    });

    expect(result.current.access).toBe('granted');
  });

  it('is denied when the user says no and cannot be asked again', async () => {
    cameraMock.setPermission('undetermined');
    cameraMock.setAnswer('denied');
    const { result } = await renderHook(() => useCameraAccess());
    await waitFor(() => {
      expect(result.current.access).toBe('undetermined');
    });

    await act(async () => {
      result.current.requestAccess();
    });

    expect(result.current.access).toBe('denied');
  });

  it('can ask again after a "no" that allows it', async () => {
    cameraMock.setPermission('denied', true);

    const { result } = await renderHook(() => useCameraAccess());

    await waitFor(() => {
      expect(result.current.access).toBe('undetermined');
    });
  });

  it('is denied in a browser that blocks the camera', async () => {
    // A browser can always be asked again as far as expo-camera knows, but
    // a blocked camera never shows its prompt.
    mockIsWeb = true;
    cameraMock.setPermission('denied', true);

    const { result } = await renderHook(() => useCameraAccess());

    await waitFor(() => {
      expect(result.current.access).toBe('denied');
    });
  });

  it('offers manual entry only when the permission cannot be read', async () => {
    // A browser without the Permissions API.
    cameraMock.setPermissionReadFails(true);

    const { result } = await renderHook(() => useCameraAccess());

    await waitFor(() => {
      expect(result.current.access).toBe('unavailable');
    });
  });
});
