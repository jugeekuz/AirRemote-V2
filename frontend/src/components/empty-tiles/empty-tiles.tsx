import { View } from 'react-native';
import { CircleFadingPlus } from 'lucide-react-native';
import { Trans } from 'react-i18next';

import { Icon, Text } from '@ui';

type EmptyTilesProps = {
  /** What is missing, e.g. "No devices available". */
  text: string;
};

/** V1's empty grid: a Poppins title and "Click the ⊕ icon to get started." */
export default function EmptyTiles({ text }: EmptyTilesProps) {
  return (
    <View className="w-full flex-1 items-center justify-center py-16">
      <Text className="font-poppins-semibold text-lg text-black">{text}</Text>
      <Text className="font-poppins text-sm text-gray-500">
        <Trans
          ns="chrome"
          i18nKey="empty-tiles.hint"
          components={{
            icon: (
              <View className="mx-1">
                <Icon
                  as={CircleFadingPlus}
                  size={16}
                  colorClassName="text-gray-500"
                />
              </View>
            ),
          }}
        />
      </Text>
    </View>
  );
}
