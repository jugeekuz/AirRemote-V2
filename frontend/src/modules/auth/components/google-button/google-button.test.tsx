import { renderWithProviders, screen } from '@utils/tests';

import GoogleButton from './google-button';

describe('GoogleButton', () => {
  it('shows Continue with Google, disabled, and says why', async () => {
    await renderWithProviders(<GoogleButton />);

    const button = screen.getByRole('button', { name: 'login.google' });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleName('login.google');
    expect(button.props.accessibilityHint).toBe('not-available');
  });
});
