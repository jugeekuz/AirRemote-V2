import { useResolveClassNames } from 'uniwind';

import { Spinner } from '@ui/heroui/components/spinner';

type TintedSpinnerProps = {
  /** The kit's sizes: 16, 24 or 32 px. */
  size: 'sm' | 'md' | 'lg';
  /** A text colour class for the rings: `text-zinc-300`. */
  colorClassName: string;
  testID?: string;
};

/**
 * The kit's spinner in any of the theme's colours (the kit's own `color`
 * offers only accent, success, warning and danger), e.g. NextUI's grey
 * `default` spinner V1 showed in its press control.
 */
export default function TintedSpinner({
  size,
  colorClassName,
  testID,
}: TintedSpinnerProps) {
  const { color } = useResolveClassNames(colorClassName);

  return (
    <Spinner
      testID={testID}
      size={size}
      color={typeof color === 'string' ? color : undefined}
    />
  );
}
