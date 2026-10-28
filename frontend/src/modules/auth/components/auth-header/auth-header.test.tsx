import { renderWithProviders, screen } from '@utils/tests';

import AuthHeader from './auth-header';

describe('AuthHeader', () => {
  it('shows the AirRemote wordmark and the subtitle', async () => {
    await renderWithProviders(
      <AuthHeader subtitle="Log in to your account to continue" />,
    );

    expect(screen.getByLabelText('logo')).toBeOnTheScreen();
    expect(
      screen.getByText('Log in to your account to continue'),
    ).toBeOnTheScreen();
  });
});
