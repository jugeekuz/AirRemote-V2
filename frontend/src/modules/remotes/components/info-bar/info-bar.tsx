import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { DeviceResponse, RemoteResponse } from '@airremote/contracts';

import {
  getRemoteInfoPicture,
  getRemoteTypeLabelKey,
} from '@modules/remotes/helpers/remote-types';
import StatusDot from '@components/status-dot';
import { Image, Text } from '@ui';

type InfoBarProps = {
  /** The remote; V1's "Loading.." in its fields until it is known. */
  remote: RemoteResponse | undefined;
  /** The remote's device; "Loading.." in its fields until it is known. */
  device: DeviceResponse | undefined;
};

/**
 * V1's dark card over the remote's buttons: the appliance's picture with
 * the remote's name and type, a glowing divider, then the device's name and
 * MAC address with whether it is connected.
 */
export default function InfoBar({ remote, device }: InfoBarProps) {
  const { t } = useTranslation('remotes');
  const loading = t('info-bar.loading');
  const picture = remote ? getRemoteInfoPicture(remote.type) : undefined;
  let status = loading;
  if (device) {
    status = device.online ? t('info-bar.online') : t('info-bar.offline');
  }

  return (
    <View className="p-1">
      <View className="h-44 w-full justify-center rounded-md bg-gray-950 p-4 shadow-2xl">
        {/* V1's rows split the card 55 / 45; the scale has no 55 %. */}
        <View className="h-[55%] w-full flex-row items-center justify-between">
          {/* V1's `background-size: auto 100%`, bottom left, clipped. */}
          <View className="h-full flex-1 flex-row items-end overflow-hidden">
            {picture && (
              // The box sets the size: expo-image drops `aspectRatio` on web.
              <View
                testID="info-bar-picture"
                className={`h-full ${picture.nudgeClassName}`}
                style={{ aspectRatio: picture.aspectRatio }}
              >
                <Image
                  source={picture.source}
                  contentFit="cover"
                  className="size-full"
                />
              </View>
            )}
          </View>
          <View>
            <Text
              numberOfLines={1}
              className="text-xl font-semibold text-white"
            >
              {remote?.name ?? loading}
            </Text>
            <Text numberOfLines={1} className="text-sm text-gray-500">
              {remote ? t(getRemoteTypeLabelKey(remote.type)) : loading}
            </Text>
          </View>
        </View>
        {/* A 2 px #1f2937 line with V1's faint white glow under it. */}
        <View className="my-1 h-0 w-full border border-gray-800 shadow-2xl shadow-white" />
        <View className="h-[45%] w-full flex-row items-center justify-between">
          <View className="ml-1 flex-1">
            <Text
              numberOfLines={1}
              className="text-lg font-semibold text-white"
            >
              {device?.name ?? loading}
            </Text>
            {/* V1 showed the MAC as its backend stored it, upper-case. */}
            <Text numberOfLines={1} className="text-sm text-gray-500">
              {device?.macAddress.toUpperCase() ?? loading}
            </Text>
          </View>
          <View className="mr-1 flex-row items-center">
            <Text className="text-lg font-semibold text-white">{status}</Text>
            {device && (
              // The text says it already; screen readers skip the dot.
              <View aria-hidden className="ml-1">
                <StatusDot online={device.online} size="md" />
              </View>
            )}
          </View>
        </View>
      </View>
    </View>
  );
}
