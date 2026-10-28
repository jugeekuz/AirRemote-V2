import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useLogout } from '@hooks/use-logout';
import { Image } from '@ui';
import { IMAGES } from '@assets/images';

import AccountMenu from './account-menu';
import BackButton from './back-button';

type TopToolbarProps = {
  /** Shows the back button instead of the logo (a nested screen). */
  onBack?: () => void;
};

/**
 * V1's top bar on every signed-in screen: the short logo, or a back button
 * on a nested screen, and the account menu.
 */
export default function TopToolbar({ onBack }: TopToolbarProps) {
  const { t } = useTranslation('chrome');
  const { logout } = useLogout();

  return (
    <View className="h-16 w-full flex-row items-center justify-between p-3">
      {onBack ? (
        <BackButton label={t('top-toolbar.back')} onPress={onBack} />
      ) : (
        <Image
          source={IMAGES.logoShort}
          contentFit="contain"
          className="size-10"
          accessible
          accessibilityRole="image"
          accessibilityLabel={t('top-toolbar.logo')}
        />
      )}
      <AccountMenu
        onLogout={() => {
          void logout();
        }}
      />
    </View>
  );
}
