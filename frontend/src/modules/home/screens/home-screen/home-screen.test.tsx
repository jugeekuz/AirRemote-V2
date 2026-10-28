import { renderWithProviders, screen, userEvent, waitFor } from '@utils/tests';
import { authApi } from '@api/auth';
import { AUTH_STATUS, authStore } from '@stores/auth';

import HomeScreen from './home-screen';

jest.mock('@api/auth');

const api = jest.mocked(authApi);

beforeEach(() => {
  jest.resetAllMocks();
  authStore.reset();
  authStore.signIn('token-1');
});

describe('HomeScreen', () => {
  it('says the user is signed in', async () => {
    await renderWithProviders(<HomeScreen />);

    expect(screen.getByText('home.title')).toBeOnTheScreen();
    expect(screen.getByText('home.signed-in')).toBeOnTheScreen();
  });

  it('signs out when Sign out is pressed', async () => {
    api.logout.mockResolvedValueOnce(undefined);
    await renderWithProviders(<HomeScreen />);

    await userEvent.press(screen.getByRole('button', { name: 'sign-out' }));

    await waitFor(() => {
      expect(authStore.getStatus()).toBe(AUTH_STATUS.ANONYMOUS);
    });
    expect(api.logout).toHaveBeenCalledTimes(1);
  });
});
