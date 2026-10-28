import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import Screen from '@components/screen';
import { Button, Text } from '@ui';

type LoadingFailedScreenProps = {
  /** Tries to restore the session again. */
  onRetry: () => void;
};

/** Shown when the session couldn't be restored at launch for a reason other than having none (e.g. offline). */
export default function LoadingFailedScreen({
  onRetry,
}: LoadingFailedScreenProps) {
  const { t } = useTranslation('screens');

  return (
    <Screen hasBottomInset>
      <View className="flex-1 items-center justify-center gap-4 px-6">
        <Text.Heading type="h3" align="center">
          {t('loading-failed.title')}
        </Text.Heading>
        <Text.Paragraph color="muted" align="center" className="max-w-sm">
          {t('loading-failed.message')}
        </Text.Paragraph>
        <Button onPress={onRetry}>
          <Button.Label>{t('retry', { ns: 'actions' })}</Button.Label>
        </Button>
      </View>
    </Screen>
  );
}
