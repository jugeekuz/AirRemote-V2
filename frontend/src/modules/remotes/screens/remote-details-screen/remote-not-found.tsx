import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button, Text } from '@ui';

type RemoteNotFoundProps = {
  /** Back to the user's remotes. */
  onBack: () => void;
};

/**
 * The remote is gone (deleted, also with its device, or a link to an id
 * that never was one). In V1's empty-state type, in the upper middle of the
 * space left under the toolbar (give it a growing parent).
 */
export default function RemoteNotFound({ onBack }: RemoteNotFoundProps) {
  const { t } = useTranslation('remotes');

  return (
    <View testID="remote-not-found" className="w-full grow items-center px-4">
      <View className="grow" />
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
      {/* Twice the space below as above: V1's empty state sat this high. */}
      <View className="grow-2" />
    </View>
  );
}
