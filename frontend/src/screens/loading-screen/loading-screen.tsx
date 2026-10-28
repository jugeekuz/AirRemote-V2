import { View } from 'react-native';

import { Spinner } from '@ui';

/** Shown while the session is being restored at launch. */
export default function LoadingScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-background">
      <Spinner size="lg" />
    </View>
  );
}
