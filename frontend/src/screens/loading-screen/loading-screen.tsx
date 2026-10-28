import { View } from 'react-native';

import Screen from '@components/screen';
import { Spinner } from '@ui';

/** Shown while the session is being restored at launch. */
export default function LoadingScreen() {
  return (
    <Screen hasBottomInset>
      <View className="flex-1 items-center justify-center">
        <Spinner size="lg" />
      </View>
    </Screen>
  );
}
