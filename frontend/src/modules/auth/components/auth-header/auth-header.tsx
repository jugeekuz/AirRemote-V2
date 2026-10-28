import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Image, Text } from '@ui';
import { IMAGES } from '@assets/images';

type AuthHeaderProps = {
  subtitle: string;
};

/**
 * The AirRemote wordmark in a 256×64 box, nudged 36 px left of centre as
 * V1's, over a grey 14 px subtitle.
 */
export default function AuthHeader({ subtitle }: AuthHeaderProps) {
  const { t } = useTranslation('auth');

  return (
    <View className="w-full items-center justify-center">
      <Image
        source={IMAGES.logo}
        contentFit="contain"
        accessibilityRole="image"
        accessibilityLabel={t('logo')}
        className="-ml-9 h-16 w-64"
      />
      <Text className="-mt-2 text-sm text-gray-500">{subtitle}</Text>
    </View>
  );
}
