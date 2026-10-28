import { useState } from 'react';
import { Pressable } from 'react-native';

import { LinearGradient, Spinner, Text } from '@ui';

type SubmitButtonProps = {
  label: string;
  /** Shows the spinner in place of the label; the button is busy and disabled. */
  isSubmitting: boolean;
  onPress: () => void;
};

/**
 * V1's Log In / Sign Up button: full width, 40 px tall, 12 px corners, a
 * blue gradient towards the top right with white 14 px text, and NextUI's
 * black spinner while the request runs. Like NextUI's button it shrinks to
 * 97 % while pressed and fades to 80 % under the pointer. Not the kit's
 * `Button`, whose disabled state dims it to 50 %: V1's keeps its colour
 * while the spinner turns.
 */
export default function SubmitButton({
  label,
  isSubmitting,
  onPress,
}: SubmitButtonProps) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: isSubmitting, busy: isSubmitting }}
      disabled={isSubmitting}
      onPress={onPress}
      onHoverIn={() => setIsHovered(true)}
      onHoverOut={() => setIsHovered(false)}
      className={`mt-6 h-10 w-full items-center justify-center overflow-hidden rounded-medium px-4 active:scale-97 ${isHovered ? 'opacity-80' : 'opacity-100'}`}
    >
      <LinearGradient
        fromColorClassName="text-blue-500"
        toColorClassName="text-blue-700"
        direction="to-tr"
        className="absolute inset-0"
      />
      {isSubmitting ? (
        <Spinner size="lg" />
      ) : (
        <Text className="text-sm font-normal text-white">{label}</Text>
      )}
    </Pressable>
  );
}
