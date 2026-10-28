import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';

import Screen from '@components/screen';
import TopToolbar from '@components/top-toolbar';
import { Text } from '@ui';

/** Placeholder: shows the shell until the real screen replaces it. */
export default function RemoteDetailsScreen() {
  const { t } = useTranslation('remotes');
  const navigation = useNavigation();

  return (
    <Screen>
      <TopToolbar onBack={() => navigation.goBack()} />
      <Text.Heading type="h3" className="ml-2">
        {t('remote-details.title')}
      </Text.Heading>
    </Screen>
  );
}
