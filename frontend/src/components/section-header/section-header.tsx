import { Pressable, View } from 'react-native';
import { CircleFadingPlus, Pencil } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { Icon, Text } from '@ui';

type SectionHeaderProps = {
  title: string;
  /** The green badge's number; empty while it is unknown. */
  count?: number;
  /** The plus button (V1 opened the add wizard). */
  onAdd: () => void;
  /** The pencil: edit mode on or off. */
  onToggleEdit: () => void;
};

/**
 * V1's header row over a tile grid: the title with a green count badge, and
 * the "+ | ✎" pill on the right.
 */
export default function SectionHeader({
  title,
  count,
  onAdd,
  onToggleEdit,
}: SectionHeaderProps) {
  const { t } = useTranslation('actions');

  return (
    <View className="mt-6 mb-3 ml-2 flex-row items-center justify-between">
      <View className="flex-row items-center">
        <Text
          accessibilityRole="header"
          className="mb-px text-xl font-medium text-black"
        >
          {title}
        </Text>
        <View className="ml-2 size-6 items-center justify-center rounded-lg bg-green-600">
          <Text className="text-center text-xs text-white">
            {count === undefined ? '' : String(count)}
          </Text>
        </View>
      </View>

      <View className="pr-3">
        <View className="h-8 flex-row items-center rounded-3xl border border-gray-300 bg-gray-100 px-2">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('add')}
            onPress={onAdd}
            hitSlop={4}
            className="size-7 items-center justify-center rounded-full bg-gray-100"
          >
            <Icon as={CircleFadingPlus} size={19} colorClassName="text-black" />
          </Pressable>
          <View className="mx-2 h-5 w-px bg-gray-300" />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('edit')}
            onPress={onToggleEdit}
            hitSlop={8}
            className="mx-0.75"
          >
            <Icon as={Pencil} size={18} colorClassName="text-black" />
          </Pressable>
        </View>
      </View>
    </View>
  );
}
