import { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import { Power } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { usePressButton } from '@modules/remotes/hooks';
import { Icon, Tick, TintedSpinner } from '@ui';

import {
  POP_STEPS,
  TICK_DELAY_MS,
  TICK_DRAW_MS,
} from './press-button.constants';

type PressButtonProps = {
  buttonId: string;
  /** For its accessible name, "Press <name>". */
  buttonName: string;
};

// CSS's `ease-in-out`, which V1's keyframes used.
const POP_EASING = Easing.bezier(0.42, 0, 0.58, 1);

/**
 * V1's press control: a 36 px circle with a green ring and a green Power
 * icon. Pressed, it spins (no ring) until the device sent the code, then
 * draws V1's tick and pops, and shows Power again after 800 ms. A failure
 * opens the Error dialog and shows Power again. The whole circle takes the
 * tap (V1's took it only on the icon); taps are ignored until it is idle.
 */
export default function PressButton({
  buttonId,
  buttonName,
}: PressButtonProps) {
  const { t } = useTranslation('remotes');
  const { phase, press } = usePressButton(buttonId);
  const scale = useSharedValue(1);

  useEffect(() => {
    if (phase !== 'succeeded') {
      cancelAnimation(scale);
      scale.set(1);
      return;
    }
    scale.set(
      withSequence(
        ...POP_STEPS.map(([to, duration]) =>
          withTiming(to, { duration, easing: POP_EASING }),
        ),
      ),
    );
    return () => {
      cancelAnimation(scale);
    };
  }, [phase, scale]);

  const popStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.get() }],
  }));
  const isPending = phase === 'pending';

  return (
    <View className="mr-2">
      <Animated.View testID="press-button-pop" style={popStyle}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('press-button.label', { name: buttonName })}
          aria-busy={isPending}
          onPress={press}
          className={`size-9 items-center justify-center rounded-full bg-gray-50 shadow-md ${isPending ? '' : 'border-2 border-green-500'}`}
        >
          {phase === 'idle' && (
            <Icon
              as={Power}
              size={17}
              strokeWidth={2.5}
              colorClassName="text-green-500"
              testID="press-button-power"
            />
          )}
          {isPending && (
            // NextUI's grey `default` spinner, as V1's.
            <TintedSpinner
              size="lg"
              colorClassName="text-zinc-300"
              testID="press-button-spinner"
            />
          )}
          {phase === 'succeeded' && (
            <Tick
              size={28}
              colorClassName="text-green-500"
              delayMs={TICK_DELAY_MS}
              durationMs={TICK_DRAW_MS}
              testID="press-button-tick"
            />
          )}
        </Pressable>
      </Animated.View>
    </View>
  );
}
