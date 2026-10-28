import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedProps,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Polyline } from 'react-native-svg';
import { useResolveClassNames } from 'uniwind';

const AnimatedPolyline = Animated.createAnimatedComponent(Polyline);

/** V1's tick, in its 130.2 × 130.2 box: the long arm, then the short one. */
const TICK_POINTS = '100.2,40.2 51.5,88.8 29.8,67.5';
const TICK_VIEW_BOX = '0 0 130.2 130.2';
const TICK_STROKE_WIDTH = 9;

/** The polyline's length: 68.8 for the long arm plus 30.4 for the short one. */
export const TICK_LENGTH =
  Math.hypot(100.2 - 51.5, 88.8 - 40.2) + Math.hypot(51.5 - 29.8, 88.8 - 67.5);

// One dash as long as the tick, then a gap twice as long. With the pattern
// shifted by one length nothing shows (not even a round cap's dot); from
// two lengths to three the dash grows from the short arm's end to the long
// arm's, as V1's CSS drew it.
const DASH_ARRAY = [TICK_LENGTH, TICK_LENGTH * 2];
const HIDDEN_OFFSET = TICK_LENGTH;
const START_OFFSET = TICK_LENGTH * 2;
const DRAWN_OFFSET = TICK_LENGTH * 3;

type TickProps = {
  /** Width and height in px. */
  size: number;
  /** A text colour class for the stroke: `text-green-500`. */
  colorClassName: string;
  /** How long it stays invisible after mounting. @default 0 */
  delayMs?: number;
  /** How long drawing it takes, decelerating; 0 shows it drawn. @default 0 */
  durationMs?: number;
  testID?: string;
};

/**
 * V1's success tick (its press control's `CheckBoxAnimation`), drawn once
 * when it mounts. Decorative: the control around it carries the name.
 */
export default function Tick({
  size,
  colorClassName,
  delayMs = 0,
  durationMs = 0,
  testID,
}: TickProps) {
  const { color } = useResolveClassNames(colorClassName);
  const offset = useSharedValue(durationMs > 0 ? HIDDEN_OFFSET : DRAWN_OFFSET);

  useEffect(() => {
    if (durationMs <= 0) {
      return;
    }
    offset.set(
      withDelay(
        delayMs,
        withSequence(
          withTiming(START_OFFSET, { duration: 0 }),
          withTiming(DRAWN_OFFSET, {
            duration: durationMs,
            easing: Easing.out(Easing.cubic),
          }),
        ),
      ),
    );
  }, [delayMs, durationMs, offset]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: offset.get(),
  }));

  return (
    <View aria-hidden pointerEvents="none">
      <Svg testID={testID} width={size} height={size} viewBox={TICK_VIEW_BOX}>
        <AnimatedPolyline
          testID="tick-line"
          points={TICK_POINTS}
          fill="none"
          stroke={typeof color === 'string' ? color : undefined}
          strokeWidth={TICK_STROKE_WIDTH}
          strokeLinecap="round"
          strokeMiterlimit={10}
          strokeDasharray={DASH_ARRAY}
          animatedProps={animatedProps}
        />
      </Svg>
    </View>
  );
}
