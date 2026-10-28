import { View } from 'react-native';
import { CircleFadingPlus } from 'lucide-react-native';
import { Trans } from 'react-i18next';

import { Icon, Text } from '@ui';

/** "Click the ⊕ icon to get started.", with the icon inline. */
export default function EmptyTilesHint() {
  return (
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
  );
}
