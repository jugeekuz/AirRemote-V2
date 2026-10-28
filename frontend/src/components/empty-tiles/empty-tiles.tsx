import { useWindowDimensions, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import RetryButton from '@components/retry-button';
import { Text } from '@ui';

import EmptyTilesHint from './empty-tiles-hint';

type EmptyTilesProps =
  | {
      /** What is missing, e.g. "No devices available". */
      text: string;
      /**
       * The list failed to load: a "Try again" button replaces "Click the ⊕
       * icon to get started.", and `text` says what failed.
       */
      onRetry?: () => void;
      isOffline?: never;
    }
  | {
      /**
       * The first load waits for the network: one line says it loads once
       * the phone is back online, with nothing to press.
       */
      isOffline: true;
      text?: never;
      onRetry?: never;
    };

/**
 * V1's empty grid: a Poppins title and "Click the ⊕ icon to get started."
 * Like V1 it is as tall as the window with an empty lower half, so the text
 * sits in the upper middle below the header. Put it in a ScrollView.
 */
export default function EmptyTiles({
  text,
  onRetry,
  isOffline,
}: EmptyTilesProps) {
  const { t } = useTranslation('chrome');
  const { height } = useWindowDimensions();

  return (
    <View
      testID="empty-tiles"
      className="w-full items-center justify-center"
      style={{ height }}
    >
      <Text className="text-center font-poppins-semibold text-lg text-black">
        {isOffline ? t('empty-tiles.offline') : text}
      </Text>
      {isOffline ? null : onRetry ? (
        <RetryButton onPress={onRetry} />
      ) : (
        <EmptyTilesHint />
      )}
      <View testID="empty-tiles-spacer" className="h-1/2" />
    </View>
  );
}
