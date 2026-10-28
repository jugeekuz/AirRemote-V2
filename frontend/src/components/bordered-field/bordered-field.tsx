import { useId, useRef, useState } from 'react';
import {
  Pressable,
  TextInput,
  View,
  type TextInputInstance,
  type TextInputProps,
} from 'react-native';

import { Text } from '@ui';

type BorderedFieldProps = {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  onBlur?: () => void;
  /** Red border, label, text and `errorMessage`. @default false */
  isInvalid?: boolean;
  /** A green label (V1's `color="success"`), once the value is good. @default false */
  isValid?: boolean;
  /** Shown under the field while it is invalid. */
  errorMessage?: string;
  /** A red asterisk after the label. @default false */
  isRequired?: boolean;
} & Pick<
  TextInputProps,
  | 'autoCapitalize'
  | 'autoComplete'
  | 'autoCorrect'
  | 'autoFocus'
  | 'inputMode'
  | 'maxLength'
  | 'onSubmitEditing'
  | 'returnKeyType'
>;

/** react-native-web turns these into ARIA on the `<input>`; native ignores them. */
type WebFieldAria = {
  'aria-invalid': boolean;
  'aria-required': boolean;
};

function borderClass(
  isInvalid: boolean,
  isFocused: boolean,
  isHovered: boolean,
) {
  if (isInvalid) {
    return 'border-danger';
  }
  if (isFocused) {
    return 'border-black';
  }
  return isHovered ? 'border-zinc-400' : 'border-zinc-200';
}

function labelColorClass(isInvalid: boolean, isValid: boolean) {
  if (isInvalid) {
    return 'text-danger';
  }
  return isValid ? 'text-success' : 'text-zinc-500';
}

/**
 * V1's bordered input (NextUI `variant="bordered"`): a 56 px box with a
 * 2 px border, black while focused, and its label inside. The label sits in
 * the middle while the field is empty and moves up, smaller, once it has
 * focus or a value. At most 320 px wide.
 */
export default function BorderedField({
  label,
  value,
  onChangeText,
  onBlur,
  isInvalid = false,
  isValid = false,
  errorMessage,
  isRequired = false,
  ...inputProps
}: BorderedFieldProps) {
  const labelId = useId();
  const inputRef = useRef<TextInputInstance>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const isLabelRaised = isFocused || value !== '';
  const errorText = isInvalid ? errorMessage : undefined;
  const webAria: WebFieldAria = {
    'aria-invalid': isInvalid,
    'aria-required': isRequired,
  };

  return (
    <View className="w-full max-w-xs">
      <Pressable
        accessible={false}
        focusable={false}
        onPress={() => inputRef.current?.focus()}
        onHoverIn={() => setIsHovered(true)}
        onHoverOut={() => setIsHovered(false)}
        className={`h-14 justify-end rounded-medium border-2 bg-background px-3 pb-2 shadow-xs ${borderClass(isInvalid, isFocused, isHovered)}`}
      >
        <View
          pointerEvents="none"
          className={`absolute left-3 flex-row ${isLabelRaised ? 'top-1.5' : 'top-3.5'}`}
        >
          <Text
            nativeID={labelId}
            className={`${isLabelRaised ? 'text-xs' : 'text-sm'} ${labelColorClass(isInvalid, isValid)}`}
          >
            {label}
          </Text>
          {isRequired && (
            <Text
              aria-hidden
              className={`ml-0.5 text-danger ${isLabelRaised ? 'text-xs' : 'text-sm'}`}
            >
              *
            </Text>
          )}
        </View>
        <TextInput
          ref={inputRef}
          aria-labelledby={labelId}
          // iOS reads this; `aria-labelledby` reaches Android and web.
          accessibilityLabel={label}
          accessibilityHint={errorText}
          {...webAria}
          value={value}
          onChangeText={onChangeText}
          onFocus={() => setIsFocused(true)}
          onBlur={() => {
            setIsFocused(false);
            onBlur?.();
          }}
          className={`h-5 p-0 text-sm font-normal outline-none ${isInvalid ? 'text-danger' : 'text-black'}`}
          {...inputProps}
        />
      </Pressable>
      {!!errorText && (
        <Text className="p-1 text-xs text-danger">{errorText}</Text>
      )}
    </View>
  );
}
