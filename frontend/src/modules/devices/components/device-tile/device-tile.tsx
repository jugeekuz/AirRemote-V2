import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { DeviceResponse } from '@airremote/contracts';

import DeleteBadge from '@components/delete-badge';
import StatusDot from '@components/status-dot';
import Wobble from '@components/wobble';
import { Image, Text } from '@ui';
import { IMAGES } from '@assets/images';

/** microcontroller3.png is 252 × 175. */
const MICROCONTROLLER_ASPECT_RATIO = 252 / 175;

type DeviceTileProps = {
  device: DeviceResponse;
  /** Edit mode: the tile wobbles and shows its delete badge. */
  isEditing: boolean;
  /** The user confirmed deleting this device. */
  onDelete: (deviceId: string) => void;
};

/**
 * V1's device tile: 160 px, grey with a 2 px border, the name and whether
 * the device is connected over the microcontroller picture. Tapping it does
 * nothing (V1 had no device page).
 */
export default function DeviceTile({
  device,
  isEditing,
  onDelete,
}: DeviceTileProps) {
  const { t } = useTranslation('devices');

  return (
    <Wobble isActive={isEditing}>
      {/* Not clipped: the delete badge sits half outside the corner. */}
      <View className="relative h-40 rounded-lg border-2 border-gray-300 bg-gray-100">
        <View className="w-full flex-1 overflow-hidden rounded-md">
          <View className="z-10 h-1/3 w-full items-start p-2">
            <Text
              numberOfLines={1}
              className="text-sm font-semibold text-gray-800"
            >
              {device.name}
            </Text>
            <View className="flex-row items-center">
              <Text className="text-xs font-normal text-gray-600">
                {device.online
                  ? t('device-tile.online')
                  : t('device-tile.offline')}
              </Text>
              {/* The text says it already; screen readers skip the dot. */}
              <View aria-hidden className="mb-0.5 ml-0.5">
                <StatusDot online={device.online} />
              </View>
            </View>
          </View>
          {/* V1's `background-size: auto 100%`, bottom left, 12 px left. */}
          <View className="h-2/3 w-full">
            {/* The box sets the size: expo-image drops `aspectRatio` on web. */}
            <View
              testID="device-tile-picture"
              className="-ml-3 h-full self-start"
              style={{ aspectRatio: MICROCONTROLLER_ASPECT_RATIO }}
            >
              <Image
                source={IMAGES.microcontroller}
                contentFit="cover"
                className="size-full"
              />
            </View>
          </View>
        </View>
        {isEditing && (
          <DeleteBadge
            position="left"
            label={t('device-tile.delete', { name: device.name })}
            onConfirm={() => {
              onDelete(device.id);
            }}
          />
        )}
      </View>
    </Wobble>
  );
}
