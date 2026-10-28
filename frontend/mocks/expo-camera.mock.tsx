// Stands in for expo-camera in Jest (mapped in jest.config.js): a camera
// with nothing in view. Tests set what the device answers through
// `cameraMock`, and show the camera a code with
// `fireEvent(screen.getByTestId(CAMERA_VIEW_TEST_ID), 'barcodeScanned', { type: 'qr', data })`,
// and fail to start it with `fireEvent(…, 'mountError', { message })`.
import { useCallback, useState } from 'react';
import { View, type ViewProps } from 'react-native';

type PermissionStatus = 'granted' | 'denied' | 'undetermined';
type PermissionResponse = {
  status: PermissionStatus;
  granted: boolean;
  canAskAgain: boolean;
  expires: 'never';
};

export const CAMERA_VIEW_TEST_ID = 'camera-view';

function permissionOf(
  status: PermissionStatus,
  canAskAgain: boolean,
): PermissionResponse {
  return {
    status,
    granted: status === 'granted',
    canAskAgain,
    expires: 'never',
  };
}

const INITIAL_CAMERA = {
  isAvailable: true,
  permission: permissionOf('granted', true),
  /** What the user answers when asked. */
  answer: 'granted' as 'granted' | 'denied',
  /** Reading the permission rejects (a browser without the Permissions API). */
  doesReadFail: false,
};
let camera = { ...INITIAL_CAMERA };

export const cameraMock = {
  reset() {
    camera = { ...INITIAL_CAMERA };
  },
  /** Whether the device has a camera at all (web without one: `false`). */
  setAvailable(isAvailable: boolean) {
    camera.isAvailable = isAvailable;
  },
  /** `denied` with `canAskAgain: false` is "turned off in the settings". */
  setPermission(status: PermissionStatus, canAskAgain = true) {
    camera.permission = permissionOf(status, canAskAgain);
  },
  setAnswer(answer: 'granted' | 'denied') {
    camera.answer = answer;
  },
  setPermissionReadFails(doesReadFail: boolean) {
    camera.doesReadFail = doesReadFail;
  },
};

type CameraViewProps = ViewProps & {
  onBarcodeScanned?: (result: { type: string; data: string }) => void;
  onMountError?: (event: { message: string }) => void;
  barcodeScannerSettings?: { barcodeTypes: string[] };
  facing?: string;
};

export function CameraView(props: CameraViewProps) {
  return <View testID={CAMERA_VIEW_TEST_ID} {...props} />;
}
CameraView.isAvailableAsync = () => Promise.resolve(camera.isAvailable);

/** Answers only when asked: the app calls it with `{ get: false }`. */
export function useCameraPermissions() {
  const [permission, setPermission] = useState<PermissionResponse | null>(null);
  const getPermission = useCallback(() => {
    if (camera.doesReadFail) {
      return Promise.reject(new Error('navigator.permissions is undefined'));
    }
    setPermission(camera.permission);
    return Promise.resolve(camera.permission);
  }, []);
  const requestPermission = useCallback(() => {
    camera.permission = permissionOf(
      camera.answer,
      camera.answer === 'granted',
    );
    setPermission(camera.permission);
    return Promise.resolve(camera.permission);
  }, []);
  return [permission, requestPermission, getPermission] as const;
}
