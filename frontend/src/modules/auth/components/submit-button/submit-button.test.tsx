import type { PressableProps } from 'react-native';

import { renderWithProviders, screen, userEvent } from '@utils/tests';

import SubmitButton from './submit-button';

// React Native folds ARIA props into the host's accessibilityState, so the
// props react-native-web reads are checked where they are passed.
const mockPressableProps: PressableProps[] = [];
jest.mock('react-native', () => {
  const RN = jest.requireActual<typeof import('react-native')>('react-native');
  const { createElement } = jest.requireActual<typeof import('react')>('react');
  // React 19 passes `ref` as a prop, so spreading the props forwards it.
  function Pressable(props: PressableProps) {
    mockPressableProps.push(props);
    return createElement(RN.Pressable, props);
  }
  return Object.setPrototypeOf({ Pressable }, RN);
});

/** The props the last render passed to the Pressable named `label`. */
function lastPressableProps(label: string) {
  return mockPressableProps.findLast(
    (props) => props.accessibilityLabel === label,
  );
}

describe('SubmitButton', () => {
  it('shows its label and submits when pressed', async () => {
    const onPress = jest.fn();
    await renderWithProviders(
      <SubmitButton label="Log In" isSubmitting={false} onPress={onPress} />,
    );

    expect(screen.getByText('Log In')).toBeOnTheScreen();
    await userEvent.press(screen.getByRole('button', { name: 'Log In' }));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('swaps the label for a spinner and is busy while submitting', async () => {
    const onPress = jest.fn();
    await renderWithProviders(
      <SubmitButton label="Log In" isSubmitting onPress={onPress} />,
    );

    const button = screen.getByRole('button', { name: 'Log In' });
    expect(button).toBeDisabled();
    expect(button).toBeBusy();
    // react-native-web reads only the ARIA props, not accessibilityState.
    expect(lastPressableProps('Log In')).toMatchObject({
      'aria-busy': true,
      'aria-disabled': true,
    });
    expect(screen.queryByText('Log In')).not.toBeOnTheScreen();

    await userEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });
});
