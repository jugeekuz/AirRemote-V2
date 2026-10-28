import { useId, useRef, useState } from 'react';
import {
  Pressable,
  TextInput,
  View,
  type TextInputInstance,
  type TextInputProps,
} from 'react-native';
import { Eye, EyeOff } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { Icon, Text } from '@ui';

/** Where the row sits in its group: the outer corners are rounded. */
export type StackedFieldPosition = 'first' | 'middle' | 'last';

type StackedFieldProps = {
  label: string;
  placeholder: string;
  value: string;
  onChangeText: (text: string) => void;
  onBlur?: () => void;
  position: StackedFieldPosition;
  /** A 2 px red border and a red label, as V1. @default false */
  isInvalid?: boolean;
  /**
   * What is wrong, for screen readers only: V1 showed no text, only the
   * red border.
   */
  errorMessage?: string;
  /** A password: hidden, with an eye to show it. @default false */
  isSecure?: boolean;
} & Pick<
  TextInputProps,
  | 'autoCapitalize'
  | 'autoComplete'
  | 'autoCorrect'
  | 'inputMode'
  | 'keyboardType'
  | 'onSubmitEditing'
  | 'returnKeyType'
  | 'submitBehavior'
  | 'textContentType'
>;

/**
 * Attributes react-native-web turns into ARIA on the `<input>`. React
 * Native's types do not declare them; native platforms ignore them and read
 * `accessibilityHint` instead.
 */
type WebFieldAria = {
  'aria-invalid': boolean;
  'aria-required': boolean;
  'aria-describedby'?: string;
};

const POSITION_CLASS: Record<StackedFieldPosition, string> = {
  first: 'rounded-t-xl',
  middle: '-mt-px',
  last: '-mt-px rounded-b-xl',
};

/** Hovered or focused rows draw over their neighbours' shared border. */
function borderClass(isInvalid: boolean, isActive: boolean): string {
  if (isInvalid) {
    return 'z-20 border-2 border-red-400';
  }
  return isActive ? 'z-10 border border-gray-400' : 'border border-gray-200';
}

/**
 * One row of V1's stacked login fields: a 56 px box whose small label sits
 * above the text, stacked on the rows before it so that they share a 1 px
 * border. Put the rows in a column, `first` to `last`.
 */
export default function StackedField({
  label,
  placeholder,
  value,
  onChangeText,
  onBlur,
  position,
  isInvalid = false,
  errorMessage,
  isSecure = false,
  ...inputProps
}: StackedFieldProps) {
  const { t } = useTranslation('auth');
  const labelId = useId();
  const errorId = useId();
  const inputRef = useRef<TextInputInstance>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isRevealed, setIsRevealed] = useState(false);
  const errorText = isInvalid ? errorMessage : undefined;
  const webAria: WebFieldAria = {
    'aria-invalid': isInvalid,
    'aria-required': true,
    'aria-describedby': errorText ? errorId : undefined,
  };

  return (
    <Pressable
      accessible={false}
      focusable={false}
      onPress={() => inputRef.current?.focus()}
      onHoverIn={() => setIsHovered(true)}
      onHoverOut={() => setIsHovered(false)}
      className={`h-14 flex-row items-center gap-3 bg-background px-3 ${POSITION_CLASS[position]} ${borderClass(isInvalid, isFocused || isHovered)}`}
    >
      <View className="flex-1 justify-center">
        <View className="flex-row">
          <Text
            nativeID={labelId}
            className={`text-xs ${isInvalid ? 'text-danger' : 'text-zinc-600'}`}
          >
            {label}
          </Text>
          <Text aria-hidden className="ml-0.5 text-xs text-danger">
            *
          </Text>
        </View>
        <TextInput
          ref={inputRef}
          aria-labelledby={labelId}
          accessibilityHint={errorText}
          {...webAria}
          value={value}
          onChangeText={onChangeText}
          onFocus={() => setIsFocused(true)}
          onBlur={() => {
            setIsFocused(false);
            onBlur?.();
          }}
          placeholder={placeholder}
          placeholderTextColorClassName={
            isInvalid ? 'accent-danger' : 'accent-zinc-500'
          }
          secureTextEntry={isSecure && !isRevealed}
          className={`p-0 text-sm font-normal outline-none ${isInvalid ? 'text-danger' : 'text-black'}`}
          {...inputProps}
        />
        {!!errorText && (
          // Hidden from everyone but `aria-describedby` on web, which still
          // reads a hidden element's text.
          <Text nativeID={errorId} aria-hidden className="hidden">
            {errorText}
          </Text>
        )}
      </View>
      {isSecure && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t(
            isRevealed ? 'fields.hide-password' : 'fields.show-password',
          )}
          onPress={() => setIsRevealed((revealed) => !revealed)}
          hitSlop={8}
        >
          <Icon
            as={isRevealed ? EyeOff : Eye}
            size={24}
            colorClassName="text-zinc-400"
          />
        </Pressable>
      )}
    </Pressable>
  );
}
