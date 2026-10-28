import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import {
  BUTTON_NAME_MAX_LENGTH,
  isValidButtonName,
} from '@modules/remotes/helpers/buttons';
import BorderedField from '@components/bordered-field';
import { Text } from '@ui';

type LearnButtonNameProps = {
  name: string;
  onChangeName: (name: string) => void;
  onSubmit: () => void;
};

/** Step 1: the new button's name (new on its remote, which the server checks). */
export default function LearnButtonName({
  name,
  onChangeName,
  onSubmit,
}: LearnButtonNameProps) {
  const { t } = useTranslation('remotes');
  const isValid = isValidButtonName(name);

  return (
    <View className="w-full gap-3">
      <Text className="text-base text-black">
        {t('learn-button.name.heading')}
      </Text>
      <BorderedField
        label={t('learn-button.name.label')}
        value={name}
        onChangeText={onChangeName}
        isValid={isValid}
        // As V1: an empty field is not wrong yet, only one that is blank.
        isInvalid={name !== '' && !isValid}
        errorMessage={t('learn-button.name.invalid')}
        maxLength={BUTTON_NAME_MAX_LENGTH}
        autoFocus
        returnKeyType="next"
        onSubmitEditing={onSubmit}
      />
    </View>
  );
}
