import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { PairingDetails } from '@app-types';
import { parsePairingLink } from '@modules/devices/helpers/pairing';
import { Modal, QrScanner, Text, type CameraAccess } from '@ui';

type AddDeviceCameraProps = {
  access: CameraAccess;
  onRequestAccess: () => void;
  /** A QR code with a valid pairing link was seen. */
  onScanned: (pairing: PairingDetails) => void;
};

/**
 * The camera, once the user allows it. A QR code that is not an AirRemote
 * pairing link keeps the camera on, with a message.
 */
export default function AddDeviceCamera({
  access,
  onRequestAccess,
  onScanned,
}: AddDeviceCameraProps) {
  const { t } = useTranslation('devices');
  const [hasScannedOther, setHasScannedOther] = useState(false);

  const handleScan = (data: string) => {
    const pairing = parsePairingLink(data);
    setHasScannedOther(!pairing);
    if (pairing) {
      onScanned(pairing);
    }
  };

  if (access === 'checking') {
    return (
      <Text className="text-sm text-zinc-500">
        {t('add-device.code.checking-camera')}
      </Text>
    );
  }
  if (access === 'denied') {
    return (
      <Text className="text-base text-black">
        {t('add-device.code.camera-denied')}
      </Text>
    );
  }
  if (access !== 'granted') {
    return (
      <>
        <Text className="text-base text-black">
          {t('add-device.code.camera-needed')}
        </Text>
        <View className="items-start">
          <Modal.Button variant="primary" onPress={onRequestAccess}>
            {t('add-device.code.allow-camera')}
          </Modal.Button>
        </View>
      </>
    );
  }
  return (
    <>
      <QrScanner onScan={handleScan} label={t('add-device.code.camera')} />
      {hasScannedOther && (
        <Text role="alert" className="text-sm text-danger">
          {t('add-device.code.invalid-scan')}
        </Text>
      )}
    </>
  );
}
