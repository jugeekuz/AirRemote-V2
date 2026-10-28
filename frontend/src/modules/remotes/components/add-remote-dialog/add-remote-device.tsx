import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { DeviceResponse } from '@airremote/contracts';

import FlatSelect from '@components/flat-select';
import RetryButton from '@components/retry-button';
import { Spinner, Text } from '@ui';

type AddRemoteDeviceProps = {
  /** The user's devices; undefined until the list first answers. */
  devices: readonly DeviceResponse[] | undefined;
  /** The first load failed, so there is nothing to pick. */
  isLoadFailed: boolean;
  /** Asks for the devices again. */
  onRetry: () => void;
  deviceId: string | null;
  onChangeDevice: (deviceId: string) => void;
};

/** What is under the question: the list, or why there is none. */
function DeviceChoice({
  devices,
  isLoadFailed,
  onRetry,
  deviceId,
  onChangeDevice,
}: AddRemoteDeviceProps) {
  const { t } = useTranslation('remotes');

  if (isLoadFailed) {
    return (
      <View className="items-start gap-1">
        <Text className="text-sm text-zinc-500">
          {t('add-remote.device.load-failed')}
        </Text>
        <RetryButton onPress={onRetry} />
      </View>
    );
  }
  if (!devices) {
    return (
      <View className="flex-row items-center gap-2">
        <Spinner size="sm" />
        <Text className="text-sm text-zinc-500">
          {t('add-remote.device.loading')}
        </Text>
      </View>
    );
  }
  if (devices.length === 0) {
    return (
      <Text className="text-sm text-zinc-500">
        {t('add-remote.device.none')}
      </Text>
    );
  }
  return (
    <FlatSelect
      label={t('add-remote.select-option')}
      accessibilityLabel={t('add-remote.device.heading')}
      options={devices.map((device) => ({
        value: device.id,
        label: device.name,
      }))}
      value={deviceId}
      onChange={onChangeDevice}
    />
  );
}

/** Step 2: the device that will send the remote's codes, by its name. */
export default function AddRemoteDevice(props: AddRemoteDeviceProps) {
  const { t } = useTranslation('remotes');

  return (
    <View className="w-full gap-4">
      <Text className="text-base text-black">
        {t('add-remote.device.heading')}
      </Text>
      <DeviceChoice {...props} />
    </View>
  );
}
