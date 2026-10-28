import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import TopToolbar from '@components/top-toolbar';
import { Text } from '@ui';

/** Placeholder: shows the shell until the real screen replaces it. */
export default function RemoteListScreen() {
  const { t } = useTranslation('remotes');

  return (
    <View className="flex-1 bg-background">
      <TopToolbar />
      <Text.Heading type="h3" className="ml-2">
        {t('remote-list.title')}
      </Text.Heading>
    </View>
  );
}
