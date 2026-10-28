import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

/** NextUI's `indeterminate-bar`: one sweep takes 1.5 s, over and over. */
export const INDETERMINATE_PROGRESS_MS = 1_500;

const SWEEP_EASING = Easing.bezier(0.65, 0.815, 0.735, 0.395);
// From translateX(-50%) scaleX(0.2) to translateX(100%) scaleX(1).
const START_SHIFT = -0.5;
const END_SHIFT = 1;
const START_SCALE = 0.2;

type IndeterminateProgressProps = {
  /** Its accessible name (V1's was "Loading..."). */
  label: string;
};

/**
 * NextUI's small indeterminate `Progress`, as V1's learn wizard showed it
 * while the device listened: a 4 px rounded grey track, at most 448 px
 * wide, with a black bar sweeping across it, growing as it goes.
 */
export default function IndeterminateProgress({
  label,
}: IndeterminateProgressProps) {
  const progress = useSharedValue(0);
  const trackWidth = useSharedValue(0);

  useEffect(() => {
    progress.set(
      withRepeat(
        withTiming(1, {
          duration: INDETERMINATE_PROGRESS_MS,
          easing: SWEEP_EASING,
        }),
        -1,
      ),
    );
    return () => {
      cancelAnimation(progress);
    };
  }, [progress]);

  const sweepStyle = useAnimatedStyle(() => {
    const at = progress.get();
    return {
      transform: [
        {
          translateX:
            trackWidth.get() * (START_SHIFT + (END_SHIFT - START_SHIFT) * at),
        },
        { scaleX: START_SCALE + (1 - START_SCALE) * at },
      ],
    };
  });

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      aria-busy
      onLayout={(event) => {
        trackWidth.set(event.nativeEvent.layout.width);
      }}
      className="h-1 w-full max-w-md overflow-hidden rounded-full bg-zinc-300/50"
    >
      <Animated.View
        testID="indeterminate-progress-indicator"
        className="absolute inset-y-0 left-0 w-full rounded-full bg-accent"
        style={[{ transformOrigin: 'left' }, sweepStyle]}
      />
    </View>
  );
}
