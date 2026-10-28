import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { isValidRemoteName } from '@modules/remotes/helpers/remotes';
import BorderedField from '@components/bordered-field';
import { Text } from '@ui';

import { REMOTE_NAME_MAX_LENGTH } from './add-remote-dialog.constants';

type AddRemoteNameProps = {
  name: string;
  onChangeName: (name: string) => void;
  onSubmit: () => void;
};

/** Step 3: the new remote's name (unique on its device). */
export default function AddRemoteName({
  name,
  onChangeName,
  onSubmit,
}: AddRemoteNameProps) {
  const { t } = useTranslation('remotes');
  const isValid = isValidRemoteName(name);

  return (
    <View className="w-full gap-3">
      <Text className="text-base text-black">
        {t('add-remote.name.heading')}
      </Text>
      <BorderedField
        label={t('add-remote.name.label')}
        value={name}
        onChangeText={onChangeName}
        isValid={isValid}
        // As V1: an empty field is not wrong yet, only one that is blank.
        isInvalid={name !== '' && !isValid}
        errorMessage={t('add-remote.name.invalid')}
        maxLength={REMOTE_NAME_MAX_LENGTH}
        autoFocus
        returnKeyType="done"
        onSubmitEditing={onSubmit}
      />
    </View>
  );
}
