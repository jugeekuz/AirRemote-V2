import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { PairingDetails } from '@app-types';
import {
  formatPairingCode,
  isValidDeviceName,
} from '@modules/devices/helpers/pairing';
import BorderedField from '@components/bordered-field';
import { Text } from '@ui';

import { DEVICE_NAME_MAX_LENGTH } from './add-device-dialog.constants';

type AddDeviceNameProps = {
  pairing: PairingDetails;
  name: string;
  onChangeName: (name: string) => void;
  onSubmit: () => void;
};

/** Step 3: the new device's name, under the board it is for. */
export default function AddDeviceName({
  pairing,
  name,
  onChangeName,
  onSubmit,
}: AddDeviceNameProps) {
  const { t } = useTranslation('devices');
  const isValid = isValidDeviceName(name);

  return (
    <View className="w-full gap-3">
      <View className="gap-1">
        <Text className="text-base text-black">
          {t('add-device.name.heading')}
        </Text>
        <Text className="text-sm text-zinc-500">
          {t('add-device.name.device', {
            macAddress: pairing.macAddress,
            pairingCode: formatPairingCode(pairing.pairingCode),
          })}
        </Text>
      </View>
      <BorderedField
        label={t('add-device.name.label')}
        value={name}
        onChangeText={onChangeName}
        isValid={isValid}
        // As V1: an empty field is not wrong yet, only one that is blank.
        isInvalid={name !== '' && !isValid}
        errorMessage={t('add-device.name.invalid')}
        maxLength={DEVICE_NAME_MAX_LENGTH}
        autoFocus
        returnKeyType="done"
        onSubmitEditing={onSubmit}
      />
    </View>
  );
}
