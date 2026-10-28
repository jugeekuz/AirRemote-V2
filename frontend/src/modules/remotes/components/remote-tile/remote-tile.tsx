import { Pressable, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import type { DeviceResponse, RemoteResponse } from '@airremote/contracts';

import {
  getRemoteTilePicture,
  getRemoteTypeLabelKey,
} from '@modules/remotes/helpers/remote-types';
import DeleteBadge from '@components/delete-badge';
import StatusDot from '@components/status-dot';
import Wobble from '@components/wobble';
import { Icon, Image, Text } from '@ui';

type RemoteTileProps = {
  remote: RemoteResponse;
  /** The device the remote uses, for its online dot; no dot while unknown. */
  device: DeviceResponse | undefined;
  /** Edit mode: the tile wobbles and shows its delete badge. */
  isEditing: boolean;
  /** The tile was pressed: show the remote's buttons. */
  onOpen: (remoteId: string) => void;
  /** The user confirmed deleting this remote. */
  onDelete: (remoteId: string) => void;
};

/**
 * V1's remote tile: 160 px, a lighter grey than the device tile, the name,
 * the type and its device's online dot over the appliance's picture, with
 * the frosted chevron circle bottom right. The whole tile opens the remote
 * (V1 only took presses on the chevron), in edit mode too.
 */
export default function RemoteTile({
  remote,
  device,
  isEditing,
  onOpen,
  onDelete,
}: RemoteTileProps) {
  const { t } = useTranslation('remotes');
  const picture = getRemoteTilePicture(remote.type);

  return (
    <Wobble isActive={isEditing}>
      {/* Not clipped: the delete badge sits half outside the corner. */}
      <View className="relative h-40 rounded-lg border-2 border-gray-300 bg-gray-100/60">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('remote-tile.open', { name: remote.name })}
          onPress={() => {
            onOpen(remote.id);
          }}
          className="w-full flex-1 overflow-hidden rounded-md"
        >
          <View className="z-10 h-1/3 w-full items-start p-2">
            <Text
              numberOfLines={1}
              className="text-sm font-semibold text-gray-800"
            >
              {remote.name}
            </Text>
            <View className="flex-row items-center">
              <Text className="text-xs font-normal text-gray-600">
                {t(getRemoteTypeLabelKey(remote.type))}
              </Text>
              {!!device && (
                <View className="mb-0.5 ml-0.5">
                  <StatusDot online={device.online} />
                </View>
              )}
            </View>
          </View>
          {/* V1's `object-contain object-left-bottom` at the area's height. */}
          <View className="h-2/3 w-full">
            <Image
              testID="remote-tile-picture"
              source={picture.source}
              contentFit="contain"
              contentPosition="bottom left"
              className={`size-full ${picture.nudgeClassName}`}
            />
            <View
              aria-hidden
              testID="remote-tile-chevron"
              className="absolute right-2 bottom-2 size-14 items-center justify-center rounded-full border border-gray-300 bg-gray-200/70 shadow-md shadow-gray-700 backdrop-blur-2xl"
            >
              <View className="opacity-95">
                <Icon
                  as={ChevronRight}
                  size={28}
                  colorClassName="text-gray-700"
                />
              </View>
            </View>
          </View>
        </Pressable>
        {isEditing && (
          <DeleteBadge
            position="left"
            label={t('remote-tile.delete', { name: remote.name })}
            onConfirm={() => {
              onDelete(remote.id);
            }}
          />
        )}
      </View>
    </Wobble>
  );
}
