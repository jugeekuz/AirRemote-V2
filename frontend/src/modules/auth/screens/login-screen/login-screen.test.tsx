import type { AccessTokenResponse } from '@airremote/contracts';

import {
  fireEvent,
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
} from '@utils/tests';
import { authApi } from '@api/auth';
import { AUTH_STATUS, authStore } from '@stores/auth';

import LoginScreen from './login-screen';

jest.mock('@api/auth');

const api = jest.mocked(authApi);
const credentials = { email: 'web@example.com', password: 'password123' };
const token: AccessTokenResponse = {
  accessToken: 'abc',
  tokenType: 'Bearer',
  expiresIn: 600,
};

beforeEach(() => {
  jest.resetAllMocks();
  authStore.reset();
  authStore.signOut();
});

async function fillAndSubmit(email: string, password: string) {
  const user = userEvent.setup();
  if (email) {
    await user.type(screen.getByLabelText('login.email'), email);
  }
  if (password) {
    await user.type(screen.getByLabelText('login.password'), password);
  }
  await user.press(screen.getByRole('button', { name: 'login.submit' }));
}

describe('LoginScreen', () => {
  it('signs in with the typed credentials', async () => {
    api.login.mockResolvedValueOnce(token);
    await renderWithProviders(<LoginScreen />);

    await fillAndSubmit(credentials.email, credentials.password);

    await waitFor(() => {
      expect(authStore.getStatus()).toBe(AUTH_STATUS.AUTHENTICATED);
    });
    expect(api.login).toHaveBeenCalledWith(credentials);
  });

  it('shows field errors and does not submit invalid input', async () => {
    await renderWithProviders(<LoginScreen />);

    await fillAndSubmit('not-an-email', '');

    expect(await screen.findByText('login.invalid-email')).toBeOnTheScreen();
    expect(screen.getByText('login.password-required')).toBeOnTheScreen();
    expect(api.login).not.toHaveBeenCalled();
  });

  it('disables the button while signing in', async () => {
    let resolveLogin: (value: AccessTokenResponse) => void = () => {};
    api.login.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveLogin = resolve;
      }),
    );
    await renderWithProviders(<LoginScreen />);

    await fillAndSubmit(credentials.email, credentials.password);

    const button = screen.getByRole('button', { name: 'login.submit' });
    await waitFor(() => {
      expect(button).toBeDisabled();
    });
    expect(button).toBeBusy();

    resolveLogin(token);
    await waitFor(() => {
      expect(authStore.getStatus()).toBe(AUTH_STATUS.AUTHENTICATED);
    });
  });

  it('does not submit again on Enter while signing in', async () => {
    let resolveLogin: (value: AccessTokenResponse) => void = () => {};
    api.login.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveLogin = resolve;
      }),
    );
    await renderWithProviders(<LoginScreen />);
    const user = userEvent.setup();
    const password = screen.getByLabelText('login.password');

    await user.type(screen.getByLabelText('login.email'), credentials.email);
    await user.type(password, credentials.password, { submitEditing: true });
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'login.submit' }),
      ).toBeDisabled();
    });
    await fireEvent(password, 'submitEditing');

    expect(api.login).toHaveBeenCalledTimes(1);
    resolveLogin(token);
    await waitFor(() => {
      expect(authStore.getStatus()).toBe(AUTH_STATUS.AUTHENTICATED);
    });
    expect(api.login).toHaveBeenCalledTimes(1);
  });
});
