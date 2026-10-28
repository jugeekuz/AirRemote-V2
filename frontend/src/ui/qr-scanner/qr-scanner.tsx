import { useCallback, useRef } from 'react';
import { View } from 'react-native';
import { CameraView, type BarcodeScanningResult } from 'expo-camera';

import { QR_SCAN_REPEAT_MS } from './qr-scanner.constants';
import styles from './qr-scanner.styles';

type QrScannerProps = {
  /** The text of a QR code the camera sees (once while it stays in view). */
  onScan: (data: string) => void;
  /** What the camera view is, for screen readers. */
  label: string;
};

const QR_ONLY = { barcodeTypes: ['qr' as const] };

/**
 * A square view of the back camera that reads QR codes. Render it only
 * once `useCameraAccess()` says `granted`.
 */
export default function QrScanner({ onScan, label }: QrScannerProps) {
  const lastSeen = useRef<{ data: string; at: number } | null>(null);

  const handleScanned = useCallback(
    ({ data }: BarcodeScanningResult) => {
      const now = Date.now();
      const last = lastSeen.current;
      lastSeen.current = { data, at: now };
      if (last?.data === data && now - last.at < QR_SCAN_REPEAT_MS) {
        return;
      }
      onScan(data);
    },
    [onScan],
  );

  return (
    <View
      accessible
      accessibilityLabel={label}
      className="aspect-square w-full max-w-xs self-center overflow-hidden rounded-large bg-black"
    >
      <CameraView
        style={styles.camera}
        facing="back"
        barcodeScannerSettings={QR_ONLY}
        onBarcodeScanned={handleScanned}
      />
    </View>
  );
}
