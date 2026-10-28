import { useEffect, useState, type ReactNode } from 'react';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

/** Each half of V1's `shake` (+1° → −1.5° → +1°, 0.2 s per loop). */
export const WOBBLE_STEP_MS = 100;
/** Each tile starts up to this late, so the tiles wobble out of phase. */
export const WOBBLE_MAX_DELAY_MS = 133;

const WOBBLE_FROM_DEG = 1;
const WOBBLE_TO_DEG = -1.5;
// CSS's `ease-in-out`.
const WOBBLE_EASING = Easing.bezier(0.42, 0, 0.58, 1);

type WobbleProps = {
  /** Wobbling while the screen is in edit mode. */
  isActive: boolean;
  /** The tile. */
  children: ReactNode;
};

/** V1's edit-mode shake around a tile; still when not active. */
export default function Wobble({ isActive, children }: WobbleProps) {
  const rotation = useSharedValue(0);
  const [delay] = useState(() => Math.random() * WOBBLE_MAX_DELAY_MS);

  useEffect(() => {
    if (!isActive) {
      cancelAnimation(rotation);
      rotation.set(0);
      return;
    }
    const step = { duration: WOBBLE_STEP_MS, easing: WOBBLE_EASING };
    rotation.set(
      withDelay(
        delay,
        withSequence(
          withTiming(WOBBLE_FROM_DEG, { duration: 0 }),
          withRepeat(
            withSequence(
              withTiming(WOBBLE_TO_DEG, step),
              withTiming(WOBBLE_FROM_DEG, step),
            ),
            -1,
          ),
        ),
      ),
    );
    return () => {
      cancelAnimation(rotation);
    };
  }, [isActive, delay, rotation]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.get()}deg` }],
  }));

  return (
    <Animated.View testID="wobble" style={animatedStyle}>
      {children}
    </Animated.View>
  );
}
