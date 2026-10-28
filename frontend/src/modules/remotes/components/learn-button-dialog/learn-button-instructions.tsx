import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Text } from '@ui';

import { LEARN_BUTTON_ADVICE_STEPS } from './learn-button-dialog.constants';

/**
 * Step 2: V1's instructions, then, as help text, V1's advice for remotes
 * with a screen (V1 asked whether the remote had one; V2 keeps no button
 * state, so the advice is for whoever needs it).
 */
export default function LearnButtonInstructions() {
  const { t } = useTranslation('remotes');

  return (
    <View className="w-full">
      <Text className="mb-3 text-base text-black">
        {t('learn-button.instructions.blink')}
      </Text>
      <Text className="my-3 text-base text-black">
        {t('learn-button.instructions.faster')}
      </Text>
      <Text className="mt-3 text-base text-black">
        {t('learn-button.instructions.ready')}
      </Text>
      {/* V1's centred three-quarter divider. */}
      <View className="my-4 h-px w-3/4 self-center bg-zinc-200" />
      <View className="gap-1">
        <Text className="text-sm text-zinc-500">
          {t('learn-button.advice.intro')}
        </Text>
        <Text className="mt-1 text-sm text-zinc-500">
          {t('learn-button.advice.heading')}
        </Text>
        {LEARN_BUTTON_ADVICE_STEPS.map((key) => (
          <View key={key} className="ml-2 flex-row">
            <Text aria-hidden className="mr-2 text-sm text-zinc-500">
              •
            </Text>
            <Text className="flex-1 text-sm text-zinc-500">
              {t(`learn-button.advice.${key}`)}
            </Text>
          </View>
        ))}
        <Text className="mt-1 text-sm text-zinc-500">
          {t('learn-button.advice.outcome')}
        </Text>
      </View>
    </View>
  );
}
