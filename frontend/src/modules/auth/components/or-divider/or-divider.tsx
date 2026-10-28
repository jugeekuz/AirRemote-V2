import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Text } from '@ui';

/** V1's "OR" between two 1 px lines, each 40 % of the row. */
export default function OrDivider() {
  const { t } = useTranslation('auth');

  return (
    <View className="mb-5 w-full flex-row items-center justify-between">
      <View aria-hidden className="h-px w-2/5 bg-separator" />
      <Text className="text-sm text-gray-500">{t('login.or')}</Text>
      <View aria-hidden className="h-px w-2/5 bg-separator" />
    </View>
  );
}
