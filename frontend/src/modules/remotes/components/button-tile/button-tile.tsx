import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { ButtonResponse } from '@airremote/contracts';

import PressButton from '@modules/remotes/components/press-button';
import DeleteBadge from '@components/delete-badge';
import Wobble from '@components/wobble';
import { Text } from '@ui';

type ButtonTileProps = {
  button: ButtonResponse;
  /** Edit mode: the tile wobbles and shows its delete badge. */
  isEditing: boolean;
  /** The user confirmed deleting this button. */
  onDelete: (buttonId: string) => void;
};

/**
 * V1's button tile: 128 px, a 1 px border (thinner than the device and
 * remote tiles), the press control at the top right and the name below.
 * V2 has no button state, so V1's "State/Stateless" line is gone, and no
 * reordering, so neither is the grip. The delete badge sits top right.
 */
export default function ButtonTile({
  button,
  isEditing,
  onDelete,
}: ButtonTileProps) {
  const { t } = useTranslation('remotes');

  return (
    <Wobble isActive={isEditing}>
      {/* Not clipped: the delete badge sits half outside the corner. */}
      <View className="relative h-32 rounded-lg border border-gray-300 bg-gray-100 p-1">
        <View className="h-1/2 w-full flex-row items-center justify-end">
          <PressButton buttonId={button.id} buttonName={button.name} />
        </View>
        <View className="h-1/2 w-full justify-center">
          <Text
            numberOfLines={2}
            className="ml-2 text-sm font-medium text-gray-800"
          >
            {button.name}
          </Text>
        </View>
        {isEditing && (
          <DeleteBadge
            position="right"
            label={t('button-tile.delete', { name: button.name })}
            onConfirm={() => {
              onDelete(button.id);
            }}
          />
        )}
      </View>
    </Wobble>
  );
}
