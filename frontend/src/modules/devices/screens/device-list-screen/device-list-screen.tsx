import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import TopToolbar from '@components/top-toolbar';
import { Text } from '@ui';

/** Placeholder: shows the shell until the real screen replaces it. */
export default function DeviceListScreen() {
  const { t } = useTranslation('devices');

  return (
    <View className="flex-1 bg-background">
      <TopToolbar />
      <Text.Heading type="h3" className="ml-2">
        {t('device-list.title')}
      </Text.Heading>
    </View>
  );
}
