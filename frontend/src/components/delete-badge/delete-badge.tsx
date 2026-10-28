import { Pressable } from 'react-native';
import { X } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { alert, Icon } from '@ui';

/** The tile corner the badge straddles: device and remote tiles use the left. */
export type DeleteBadgePosition = 'left' | 'right';

type DeleteBadgeProps = {
  position: DeleteBadgePosition;
  /** Its accessible name, e.g. "Delete Living room". @default "Delete" */
  label?: string;
  /** The user answered Yes to V1's confirmation. */
  onConfirm: () => void;
};

const POSITION_CLASS: Record<DeleteBadgePosition, string> = {
  left: '-top-3 -left-2',
  right: '-top-3 -right-2',
};

/**
 * V1's edit-mode delete badge: a 24 px grey circle with an ×, half over the
 * tile's top corner. It asks "Are you sure you want to delete this item?"
 * first. The tile must not clip it (no `overflow-hidden` on the tile itself).
 */
export default function DeleteBadge({
  position,
  label,
  onConfirm,
}: DeleteBadgeProps) {
  const { t } = useTranslation();

  const askToDelete = async () => {
    const confirmed = await alert.confirm({
      title: t('confirm.title'),
      message: t('confirm.delete'),
      confirmLabel: t('yes', { ns: 'actions' }),
      cancelLabel: t('no', { ns: 'actions' }),
    });
    if (confirmed) {
      onConfirm();
    }
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label ?? t('delete', { ns: 'actions' })}
      onPress={() => {
        void askToDelete();
      }}
      hitSlop={8}
      className={`absolute z-50 size-6 items-center justify-center rounded-full border border-gray-300 bg-gray-300 opacity-80 shadow-xs shadow-gray-500 ${POSITION_CLASS[position]}`}
    >
      <Icon as={X} size={14} strokeWidth={2.5} colorClassName="text-black" />
    </Pressable>
  );
}
