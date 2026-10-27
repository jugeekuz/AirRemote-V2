import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useLogout } from '@hooks/use-logout';
import { Button, Text } from '@ui';

/** Placeholder Home: says the user is signed in and lets them sign out. */
export default function HomeScreen() {
  const { t } = useTranslation('home');
  const { logout, isLoggingOut } = useLogout();

  return (
    <View className="flex-1 items-center justify-center bg-background px-6">
      <View className="w-full max-w-sm gap-6">
        <Text.Heading type="h3" align="center">
          {t('home.title')}
        </Text.Heading>
        <Text.Paragraph color="muted" align="center">
          {t('home.signed-in')}
        </Text.Paragraph>
        <Button
          variant="secondary"
          onPress={() => void logout()}
          isDisabled={isLoggingOut}
          accessibilityState={{ disabled: isLoggingOut, busy: isLoggingOut }}
        >
          <Button.Label>{t('sign-out', { ns: 'actions' })}</Button.Label>
        </Button>
      </View>
    </View>
  );
}
