import { Pressable, View } from 'react-native';
import { RotateCw } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { Icon, Text } from '@ui';

type RetryButtonProps = {
  onPress: () => void;
};

/**
 * "Try again" after a failed load: a small underlined grey link with a
 * turning arrow, in the empty grid's hint type (Poppins 14 px).
 */
export default function RetryButton({ onPress }: RetryButtonProps) {
  const { t } = useTranslation('actions');

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      hitSlop={8}
      className="flex-row items-center"
    >
      <View className="mr-1">
        <Icon as={RotateCw} size={16} colorClassName="text-gray-500" />
      </View>
      <Text className="font-poppins text-sm text-gray-500 underline">
        {t('try-again')}
      </Text>
    </Pressable>
  );
}
