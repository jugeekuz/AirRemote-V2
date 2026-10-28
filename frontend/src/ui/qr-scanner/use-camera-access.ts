import { useCallback, useEffect, useState } from 'react';
import { useCameraPermissions } from 'expo-camera';

import { isCameraAvailable } from './is-camera-available';

/**
 * - `checking`: not known yet
 * - `unavailable`: no camera (a browser without one)
 * - `undetermined`: the user can be asked
 * - `denied`: the user said no and can't be asked again (only the system
 *   settings can turn it on)
 * - `granted`: the camera can be used
 */
export type CameraAccess =
  'checking' | 'unavailable' | 'undetermined' | 'denied' | 'granted';

/** Whether the camera can be used, and a way to ask the user for it. */
export function useCameraAccess(): {
  access: CameraAccess;
  requestAccess: () => void;
} {
  const [isAvailable, setIsAvailable] = useState<boolean | null>(null);
  // Asked only once a camera is known to exist.
  const [permission, requestPermission, getPermission] = useCameraPermissions({
    get: false,
  });

  useEffect(() => {
    let isCurrent = true;
    void isCameraAvailable().then((available) => {
      if (!isCurrent) {
        return;
      }
      setIsAvailable(available);
      if (available) {
        void getPermission();
      }
    });
    return () => {
      isCurrent = false;
    };
  }, [getPermission]);

  const requestAccess = useCallback(() => {
    void requestPermission();
  }, [requestPermission]);

  return { access: getCameraAccess(isAvailable, permission), requestAccess };
}

function getCameraAccess(
  isAvailable: boolean | null,
  permission: { granted: boolean; canAskAgain: boolean } | null,
): CameraAccess {
  if (isAvailable === false) {
    return 'unavailable';
  }
  if (isAvailable === null || permission === null) {
    return 'checking';
  }
  if (permission.granted) {
    return 'granted';
  }
  return permission.canAskAgain ? 'undetermined' : 'denied';
}
