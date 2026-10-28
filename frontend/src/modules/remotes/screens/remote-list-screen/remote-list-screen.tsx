import { useTranslation } from 'react-i18next';

import Screen from '@components/screen';
import TopToolbar from '@components/top-toolbar';
import { Text } from '@ui';

/** Placeholder: shows the shell until the real screen replaces it. */
export default function RemoteListScreen() {
  const { t } = useTranslation('remotes');

  return (
    <Screen>
      <TopToolbar />
      <Text.Heading type="h3" className="ml-2">
        {t('remote-list.title')}
      </Text.Heading>
    </Screen>
  );
}
