import { Text } from '@ui';

type AuthFooterProps = {
  /** The question: "Need to create an account?" */
  prompt: string;
  /** The link after it: "Sign Up". */
  linkLabel: string;
  onPress: () => void;
};

/** V1's line under the form: grey 14 px text with a blue link at its end. */
export default function AuthFooter({
  prompt,
  linkLabel,
  onPress,
}: AuthFooterProps) {
  return (
    <Text className="mt-2 text-center text-sm font-normal text-gray-500">
      {prompt}{' '}
      <Text
        accessibilityRole="link"
        onPress={onPress}
        className="text-sm font-medium text-blue-500"
      >
        {linkLabel}
      </Text>
    </Text>
  );
}
