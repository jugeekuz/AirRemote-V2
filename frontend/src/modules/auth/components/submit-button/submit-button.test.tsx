import { renderWithProviders, screen, userEvent } from '@utils/tests';

import SubmitButton from './submit-button';

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
    expect(screen.queryByText('Log In')).not.toBeOnTheScreen();

    await userEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });
});
