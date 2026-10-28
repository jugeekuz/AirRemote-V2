import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { REMOTE_TYPES, type RemoteType } from '@airremote/contracts';

import { getRemoteTypeLabelKey } from '@modules/remotes/helpers/remote-types';
import FlatSelect from '@components/flat-select';
import { Text } from '@ui';

type AddRemoteTypeProps = {
  type: RemoteType | null;
  onChangeType: (type: RemoteType) => void;
};

/** Step 1: the remote's category, in V1's order. */
export default function AddRemoteType({
  type,
  onChangeType,
}: AddRemoteTypeProps) {
  const { t } = useTranslation('remotes');
  const options = REMOTE_TYPES.map((value) => ({
    value,
    label: t(getRemoteTypeLabelKey(value)),
  }));

  return (
    <View className="w-full gap-4">
      <Text className="text-base text-black">
        {t('add-remote.type.heading')}
      </Text>
      <FlatSelect
        label={t('add-remote.select-option')}
        options={options}
        value={type}
        onChange={onChangeType}
      />
    </View>
  );
}
