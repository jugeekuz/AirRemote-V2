import { CameraView } from 'expo-camera';

/**
 * Whether this device has a camera. Browsers can tell (a desktop may have
 * none); expo-camera has no such check on Android and iOS, where it throws,
 * and a phone always has one.
 */
export function isCameraAvailable(): Promise<boolean> {
  try {
    return CameraView.isAvailableAsync().catch(() => true);
  } catch {
    return Promise.resolve(true);
  }
}
