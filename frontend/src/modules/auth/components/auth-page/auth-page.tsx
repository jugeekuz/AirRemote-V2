import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';

import Screen from '@components/screen';

type AuthPageProps = {
  children: ReactNode;
};

/**
 * V1's Login and Sign up page: a white page with one column centred in it,
 * 90 % of the width on phones, narrower on wider screens. It scrolls when
 * the keyboard leaves too little room.
 */
export default function AuthPage({ children }: AuthPageProps) {
  return (
    <Screen hasBottomInset>
      <ScrollView
        className="flex-1"
        contentContainerClassName="grow items-center justify-center py-6"
        keyboardShouldPersistTaps="handled"
      >
        <View className="w-9/10 items-center justify-center sm:w-7/10 md:w-3/5 lg:w-1/2 xl:w-3/10 2xl:w-1/5">
          {children}
        </View>
      </ScrollView>
    </Screen>
  );
}
