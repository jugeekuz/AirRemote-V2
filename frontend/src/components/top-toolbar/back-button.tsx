import { Pressable } from 'react-native';
import { ArrowLeft } from 'lucide-react-native';

import { Icon } from '@ui';

type BackButtonProps = {
  label: string;
  onPress: () => void;
};

/** V1's 32 px grey square with a black arrow. */
export default function BackButton({ label, onPress }: BackButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={6}
      className="size-8 items-center justify-center rounded-md bg-gray-50"
    >
      <Icon as={ArrowLeft} size={24} colorClassName="text-black" />
    </Pressable>
  );
}
