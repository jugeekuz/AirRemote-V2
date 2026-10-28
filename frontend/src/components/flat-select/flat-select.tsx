import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { isWebPlatform } from '@utils/platform';
import { Select, Text } from '@ui';

export type FlatSelectOption<V extends string = string> = {
  value: V;
  label: string;
};

type FlatSelectProps<V extends string> = {
  /** Inside the field, as V1's NextUI label ("Select an option"). */
  label: string;
  /** Its accessible name, e.g. the question it answers. @default label */
  accessibilityLabel?: string;
  options: readonly FlatSelectOption<V>[];
  /** The picked option's value, or null for none. */
  value: V | null;
  onChange: (value: V) => void;
};

/**
 * V1's NextUI Select (flat): a 56 px grey field, at most 320 px wide, with
 * its label inside (14 px, smaller and higher once something is picked)
 * and a chevron; it opens a list of the options below it, at most 256 px
 * tall and scrolling beyond that.
 */
export default function FlatSelect<V extends string>({
  label,
  accessibilityLabel = label,
  options,
  value,
  onChange,
}: FlatSelectProps<V>) {
  const { t } = useTranslation('chrome');
  const [isOpen, setIsOpen] = useState(false);
  const selected = options.find((option) => option.value === value);
  // Browsers announce a combobox's name, not `aria-valuetext`.
  const name =
    isWebPlatform && selected
      ? t('flat-select.label-with-value', {
          name: accessibilityLabel,
          value: selected.label,
        })
      : accessibilityLabel;

  return (
    <Select
      value={selected}
      onValueChange={(picked) => {
        const option = options.find((o) => o.value === picked?.value);
        if (option) {
          onChange(option.value);
        }
      }}
      isOpen={isOpen}
      onOpenChange={setIsOpen}
    >
      <Select.Trigger
        variant="unstyled"
        accessibilityLabel={name}
        aria-valuetext={selected?.label}
        aria-expanded={isOpen}
        className="h-14 w-full max-w-xs justify-center rounded-medium bg-zinc-100 py-2 pr-9 pl-3 shadow-xs"
      >
        <Text
          numberOfLines={1}
          className={
            selected ? 'text-xs text-zinc-500' : 'text-sm text-zinc-500'
          }
        >
          {label}
        </Text>
        {!!selected && (
          <Text numberOfLines={1} className="text-sm text-black">
            {selected.label}
          </Text>
        )}
        <View className="absolute top-0 right-3 bottom-0 justify-center">
          <Select.TriggerIndicator iconProps={{ size: 16 }} />
        </View>
      </Select.Trigger>
      <Select.Portal>
        <Select.Overlay />
        <Select.Content
          presentation="popover"
          placement="bottom"
          width="trigger"
          className="rounded-large p-1 shadow-medium"
        >
          <ScrollView testID="flat-select-options" className="max-h-62">
            {options.map((option) => (
              <Select.Item
                key={option.value}
                value={option.value}
                label={option.label}
                className="rounded-small px-2 py-1.5"
              >
                <Select.ItemLabel className="text-sm font-normal text-black" />
                <Select.ItemIndicator />
              </Select.Item>
            ))}
          </ScrollView>
        </Select.Content>
      </Select.Portal>
    </Select>
  );
}
