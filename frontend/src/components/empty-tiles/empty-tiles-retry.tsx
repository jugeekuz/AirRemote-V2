import { Pressable, View } from 'react-native';
import { RotateCw } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { Icon, Text } from '@ui';

type EmptyTilesRetryProps = {
  onPress: () => void;
};

/** "Try again" in the hint's place and type, after a failed load. */
export default function EmptyTilesRetry({ onPress }: EmptyTilesRetryProps) {
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
