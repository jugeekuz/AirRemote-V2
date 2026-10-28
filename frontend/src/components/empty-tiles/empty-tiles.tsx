import { useWindowDimensions, View } from 'react-native';
import { CircleFadingPlus } from 'lucide-react-native';
import { Trans } from 'react-i18next';

import { Icon, Text } from '@ui';

type EmptyTilesProps = {
  /** What is missing, e.g. "No devices available". */
  text: string;
};

/**
 * V1's empty grid: a Poppins title and "Click the ⊕ icon to get started."
 * Like V1 it is as tall as the window with an empty lower half, so the text
 * sits in the upper middle below the header. Put it in a ScrollView.
 */
export default function EmptyTiles({ text }: EmptyTilesProps) {
  const { height } = useWindowDimensions();

  return (
    <View
      testID="empty-tiles"
      className="w-full items-center justify-center"
      style={{ height }}
    >
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
      <View testID="empty-tiles-spacer" className="h-1/2" />
    </View>
  );
}
