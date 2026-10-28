import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { DeviceResponse } from '@airremote/contracts';

import FlatSelect from '@components/flat-select';
import { Text } from '@ui';

type AddRemoteDeviceProps = {
  devices: readonly DeviceResponse[];
  /** The device list has answered (it may be empty). */
  isLoaded: boolean;
  deviceId: string | null;
  onChangeDevice: (deviceId: string) => void;
};

/** Step 2: the device that will send the remote's codes, by its name. */
export default function AddRemoteDevice({
  devices,
  isLoaded,
  deviceId,
  onChangeDevice,
}: AddRemoteDeviceProps) {
  const { t } = useTranslation('remotes');
  const options = devices.map((device) => ({
    value: device.id,
    label: device.name,
  }));

  return (
    <View className="w-full gap-4">
      <Text className="text-base text-black">
        {t('add-remote.device.heading')}
      </Text>
      {isLoaded && devices.length === 0 ? (
        <Text className="text-sm text-zinc-500">
          {t('add-remote.device.none')}
        </Text>
      ) : (
        <FlatSelect
          label={t('add-remote.select-option')}
          options={options}
          value={deviceId}
          onChange={onChangeDevice}
        />
      )}
    </View>
  );
}
