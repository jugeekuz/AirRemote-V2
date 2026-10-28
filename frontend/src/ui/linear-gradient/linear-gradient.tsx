import type { ReactNode } from 'react';
import { LinearGradient as ExpoLinearGradient } from 'expo-linear-gradient';
import { useResolveClassNames, withUniwind } from 'uniwind';

const StyledGradient = withUniwind(ExpoLinearGradient);

/** Tailwind's `bg-gradient-to-*` directions the app uses. */
export type GradientDirection = 'to-r' | 'to-tr';

type Point = { x: number; y: number };

const DIRECTION_POINTS: Record<
  GradientDirection,
  { start: Point; end: Point }
> = {
  'to-r': { start: { x: 0, y: 0.5 }, end: { x: 1, y: 0.5 } },
  'to-tr': { start: { x: 0, y: 1 }, end: { x: 1, y: 0 } },
};

type LinearGradientProps = {
  /** A text colour class for the first stop: `text-blue-500`. */
  fromColorClassName: string;
  /** A text colour class for the last stop: `text-blue-700`. */
  toColorClassName: string;
  /** @default 'to-tr' */
  direction?: GradientDirection;
  className?: string;
  testID?: string;
  children?: ReactNode;
};

function colorOf(style: ReturnType<typeof useResolveClassNames>): string {
  return typeof style.color === 'string' ? style.color : 'transparent';
}

/**
 * `expo-linear-gradient` with Tailwind's colours instead of hex values, as
 * V1's `bg-gradient-to-tr from-blue-500 to-blue-700`. Size it with
 * `className`; as a button's background, pass it inside `Button.Background`.
 */
export default function LinearGradient({
  fromColorClassName,
  toColorClassName,
  direction = 'to-tr',
  className,
  testID,
  children,
}: LinearGradientProps) {
  const from = colorOf(useResolveClassNames(fromColorClassName));
  const to = colorOf(useResolveClassNames(toColorClassName));
  const { start, end } = DIRECTION_POINTS[direction];

  return (
    <StyledGradient
      colors={[from, to]}
      start={start}
      end={end}
      className={className}
      testID={testID}
    >
      {children}
    </StyledGradient>
  );
}
