import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import IndeterminateProgress from '@components/indeterminate-progress';
import { Text } from '@ui';

/** Step 3: the device listens until it reads the button or gives up. */
export default function LearnButtonListening() {
  const { t } = useTranslation('remotes');

  return (
    <View className="w-full">
      <Text className="mb-4 text-base text-black">
        {t('learn-button.listening')}
      </Text>
      <IndeterminateProgress label={t('learn-button.progress')} />
    </View>
  );
}
