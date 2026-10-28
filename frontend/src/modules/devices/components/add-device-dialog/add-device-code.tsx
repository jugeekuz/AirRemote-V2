import { useState } from 'react';
import { View } from 'react-native';
import { Trans, useTranslation } from 'react-i18next';

import type { PairingDetails } from '@app-types';
import {
  isValidMacAddress,
  isValidPairingCode,
  MAC_ADDRESS_INPUT_LENGTH,
  PAIRING_CODE_INPUT_LENGTH,
} from '@modules/devices/helpers/pairing';
import BorderedField from '@components/bordered-field';
import { Switch, Text, useCameraAccess } from '@ui';

import AddDeviceCamera from './add-device-camera';

type AddDeviceCodeProps = {
  macAddress: string;
  pairingCode: string;
  isManual: boolean;
  onChangeMacAddress: (text: string) => void;
  onChangePairingCode: (text: string) => void;
  onChangeManual: (isManual: boolean) => void;
  onScanned: (pairing: PairingDetails) => void;
};

/**
 * Step 2: the board's QR code through the camera, or its MAC address and
 * code typed by hand ("Enter manually"). Without a camera (a browser with
 * none) only the typing is offered; a camera that fails to start switches
 * to typing, with a message.
 */
export default function AddDeviceCode({
  macAddress,
  pairingCode,
  isManual,
  onChangeMacAddress,
  onChangePairingCode,
  onChangeManual,
  onScanned,
}: AddDeviceCodeProps) {
  const { t } = useTranslation('devices');
  const { access, requestAccess } = useCameraAccess();
  const isCameraless = access === 'unavailable';
  const [hasCameraFailed, setHasCameraFailed] = useState(false);

  const handleCameraError = () => {
    setHasCameraFailed(true);
    onChangeManual(true);
  };

  return (
    <View className="w-full gap-3">
      {!isCameraless && (
        <View className="flex-row items-center justify-between gap-3">
          <Text className="flex-1 text-base font-medium text-black">
            {t('add-device.code.heading')}
          </Text>
          <View className="flex-row items-center gap-2">
            <Text aria-hidden className="text-sm text-zinc-500">
              {t('add-device.code.enter-manually')}
            </Text>
            <Switch
              isSelected={isManual}
              onSelectedChange={onChangeManual}
              accessibilityLabel={t('add-device.code.enter-manually')}
            />
          </View>
        </View>
      )}
      {hasCameraFailed && isManual && (
        <Text role="alert" className="text-sm text-danger">
          {t('add-device.code.camera-failed')}
        </Text>
      )}
      {isManual || isCameraless ? (
        <ManualEntry
          macAddress={macAddress}
          pairingCode={pairingCode}
          onChangeMacAddress={onChangeMacAddress}
          onChangePairingCode={onChangePairingCode}
        />
      ) : (
        <AddDeviceCamera
          access={access}
          onRequestAccess={requestAccess}
          onScanned={onScanned}
          onCameraError={handleCameraError}
        />
      )}
    </View>
  );
}

type ManualEntryProps = Pick<
  AddDeviceCodeProps,
  'macAddress' | 'pairingCode' | 'onChangeMacAddress' | 'onChangePairingCode'
>;

/** The two fields; each says what is wrong once it has been left. */
function ManualEntry({
  macAddress,
  pairingCode,
  onChangeMacAddress,
  onChangePairingCode,
}: ManualEntryProps) {
  const { t } = useTranslation('devices');
  const [hasLeftMac, setHasLeftMac] = useState(false);
  const [hasLeftCode, setHasLeftCode] = useState(false);
  const isMacValid = isValidMacAddress(macAddress);
  const isCodeValid = isValidPairingCode(pairingCode);

  return (
    <>
      <Text className="text-base text-black">
        <Trans
          ns="devices"
          i18nKey="add-device.code.manual-heading"
          components={{
            cmd: <Text className="font-mono text-sm text-black" />,
          }}
        />
      </Text>
      <BorderedField
        label={t('add-device.code.mac-address')}
        value={macAddress}
        onChangeText={onChangeMacAddress}
        onBlur={() => setHasLeftMac(true)}
        isRequired
        isValid={isMacValid}
        isInvalid={hasLeftMac && macAddress !== '' && !isMacValid}
        errorMessage={t('add-device.code.mac-address-invalid')}
        autoCapitalize="characters"
        autoComplete="off"
        autoCorrect={false}
        maxLength={MAC_ADDRESS_INPUT_LENGTH}
      />
      <BorderedField
        label={t('add-device.code.pairing-code')}
        value={pairingCode}
        onChangeText={onChangePairingCode}
        onBlur={() => setHasLeftCode(true)}
        isRequired
        isValid={isCodeValid}
        isInvalid={hasLeftCode && pairingCode !== '' && !isCodeValid}
        errorMessage={t('add-device.code.pairing-code-invalid')}
        autoCapitalize="characters"
        autoComplete="off"
        autoCorrect={false}
        maxLength={PAIRING_CODE_INPUT_LENGTH}
      />
    </>
  );
}
