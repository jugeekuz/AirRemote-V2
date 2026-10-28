import { useWindowDimensions, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button, Text } from '@ui';

type RemoteNotFoundProps = {
  /** Back to the user's remotes. */
  onBack: () => void;
};

/**
 * The remote is gone (deleted, also with its device, or a link to an id
 * that never was one). In V1's empty-state type, where the grid would be.
 */
export default function RemoteNotFound({ onBack }: RemoteNotFoundProps) {
  const { t } = useTranslation('remotes');
  const { height } = useWindowDimensions();

  return (
    <View
      testID="remote-not-found"
      className="w-full items-center justify-center px-4"
      style={{ height }}
    >
      <Text className="text-center font-poppins-semibold text-lg text-black">
        {t('remote-details.not-found')}
      </Text>
      <Button
        variant="primary"
        onPress={onBack}
        className="mt-4 h-10 min-w-20 rounded-medium bg-accent px-4"
      >
        <Button.Label className="text-sm font-normal text-accent-foreground">
          {t('remote-details.back-to-remotes')}
        </Button.Label>
      </Button>
      <View className="h-1/2" />
    </View>
  );
}
