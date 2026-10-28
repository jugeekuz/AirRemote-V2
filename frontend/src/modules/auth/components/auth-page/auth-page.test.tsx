import { Text } from 'react-native';

import { renderWithProviders, screen } from '@utils/tests';

import AuthPage from './auth-page';

describe('AuthPage', () => {
  it('shows its content', async () => {
    await renderWithProviders(
      <AuthPage>
        <Text>Form</Text>
      </AuthPage>,
    );

    expect(screen.getByText('Form')).toBeOnTheScreen();
  });
});
