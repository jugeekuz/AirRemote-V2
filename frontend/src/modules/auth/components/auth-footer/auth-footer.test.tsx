import { renderWithProviders, screen, userEvent } from '@utils/tests';

import AuthFooter from './auth-footer';

describe('AuthFooter', () => {
  it('asks the question and follows the link when it is pressed', async () => {
    const onPress = jest.fn();
    await renderWithProviders(
      <AuthFooter
        prompt="Need to create an account?"
        linkLabel="Sign Up"
        onPress={onPress}
      />,
    );

    expect(
      screen.getByText('Need to create an account?', { exact: false }),
    ).toBeOnTheScreen();
    await userEvent.press(screen.getByRole('link', { name: 'Sign Up' }));

    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
