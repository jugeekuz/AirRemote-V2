import { useTranslation } from 'react-i18next';

import { Button, Image } from '@ui';
import { IMAGES } from '@assets/images';

/**
 * V1's outlined "Continue with Google" button. V2 has no Google sign-in
 * yet, so it shows disabled (the kit dims it to 50 %) and says so.
 */
export default function GoogleButton() {
  const { t } = useTranslation('auth');

  return (
    <Button
      variant="outline"
      isDisabled
      accessibilityLabel={t('login.google')}
      accessibilityHint={t('not-available', { ns: 'messages' })}
      className="h-10 w-full gap-2 rounded-medium border-2 border-gray-200 bg-transparent px-4"
    >
      <Image
        source={IMAGES.googleLogo}
        contentFit="contain"
        className="size-5"
      />
      <Button.Label className="text-sm font-normal text-gray-600">
        {t('login.google')}
      </Button.Label>
    </Button>
  );
}
