import { View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useResolveClassNames } from 'uniwind';

type IconProps = {
  /** The glyph, a `lucide-react-native` icon (`Pencil`, `X`, ...). */
  as: LucideIcon;
  /** Width and height in px. @default 24 */
  size?: number;
  /** @default 2 */
  strokeWidth?: number;
  /** A text colour class for the stroke: `text-black`, `text-green-500`. */
  colorClassName?: string;
  /** A text colour class for the fill (none without it): `text-green-500`. */
  fillClassName?: string;
  testID?: string;
};

/**
 * A lucide icon coloured with the theme's classes instead of hex values.
 * Icons are decorative and hidden from screen readers: the button or text
 * around one carries the name.
 */
export default function Icon({
  as: Glyph,
  size = 24,
  strokeWidth = 2,
  colorClassName = 'text-foreground',
  fillClassName,
  testID,
}: IconProps) {
  const { color } = useResolveClassNames(colorClassName);
  const { color: fill } = useResolveClassNames(fillClassName ?? '');

  // `aria-hidden` on a View works on every platform; the SVG itself would
  // pass it to the DOM on web as an unknown attribute.
  return (
    <View aria-hidden pointerEvents="none">
      <Glyph
        size={size}
        strokeWidth={strokeWidth}
        color={typeof color === 'string' ? color : undefined}
        fill={typeof fill === 'string' ? fill : 'none'}
        testID={testID}
      />
    </View>
  );
}
