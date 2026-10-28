import { View } from 'react-native';
import { Trans, useTranslation } from 'react-i18next';

import { Text } from '@ui';

/** The lead-in and command styles the steps' texts use (`<b>`, `<cmd>`). */
const TEXT_COMPONENTS = {
  b: <Text className="text-base font-medium text-black" />,
  cmd: <Text className="font-mono text-sm text-black" />,
};

const BOARD_STEPS = [
  'add-device.instructions.usb',
  'add-device.instructions.wifi',
  'add-device.instructions.pair',
  'add-device.instructions.status',
] as const;

/** Step 1: how a board (or the simulator) gets a pairing code. */
export default function AddDeviceInstructions() {
  const { t } = useTranslation('devices');

  return (
    <View className="-mt-1 w-full">
      <Text className="mb-2 text-base font-medium text-black">
        {t('add-device.instructions.heading')}
      </Text>
      <View className="mt-1 mb-2 gap-1">
        {BOARD_STEPS.map((key, index) => (
          <View key={key} className="flex-row">
            <Text className="w-6 text-base text-black">{`${index + 1}.`}</Text>
            <Text className="flex-1 text-base text-black">
              <Trans ns="devices" i18nKey={key} components={TEXT_COMPONENTS} />
            </Text>
          </View>
        ))}
      </View>
      <Text className="text-base text-black">
        <Trans
          ns="devices"
          i18nKey="add-device.instructions.simulator"
          components={TEXT_COMPONENTS}
        />
      </Text>
    </View>
  );
}
