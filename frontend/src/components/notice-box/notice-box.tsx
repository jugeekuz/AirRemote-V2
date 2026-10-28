import { View } from 'react-native';
import { BadgeAlert } from 'lucide-react-native';

import { Icon, Text } from '@ui';

type NoticeBoxProps = {
  /** The notice, one short sentence. */
  children: string;
};

/** V1's green notice under a section header: a badge icon and a line of text. */
export default function NoticeBox({ children }: NoticeBoxProps) {
  return (
    <View className="-mt-1 min-h-12 w-full flex-row p-1 pr-2">
      <View className="w-full flex-row items-center rounded-md border-2 border-green-500 bg-green-100/50 py-1">
        <View className="mx-2">
          <Icon
            as={BadgeAlert}
            size={23}
            colorClassName="text-white"
            fillClassName="text-green-500"
          />
        </View>
        <Text className="flex-1 text-xs font-medium text-gray-700">
          {children}
        </Text>
      </View>
    </View>
  );
}
