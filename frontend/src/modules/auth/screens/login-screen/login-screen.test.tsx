import { NavigationContainer } from '@react-navigation/native';
import type { QueryClient } from '@tanstack/react-query';

import type { AccessTokenResponse } from '@airremote/contracts';

import type { ApiError } from '@app-types';
import {
  fireEvent,
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
} from '@utils/tests';
import { authApi } from '@api/auth';
import { createQueryClient } from '@queries/query-client';
import { AUTH_STATUS, authStore } from '@stores/auth';
import AuthNavigator from '@modules/auth/navigation/auth-navigator';

jest.mock('@api/auth');

const api = jest.mocked(authApi);
const credentials = { email: 'web@example.com', password: 'password123' };
const token: AccessTokenResponse = {
  accessToken: 'abc',
  tokenType: 'Bearer',
  expiresIn: 600,
};
const wrongCredentials: ApiError = {
  status: 401,
  code: 'INVALID_CREDENTIALS',
  message: 'Invalid credentials',
  isNetworkError: false,
};

let queryClient: QueryClient;
let onApiError: jest.Mock;

beforeEach(() => {
  jest.resetAllMocks();
  authStore.reset();
  authStore.signOut();
  onApiError = jest.fn();
  // The app's client, with the Error dialog replaced by a mock. Mutations
  // keep no garbage-collection timer, which would keep Jest running.
  queryClient = createQueryClient(onApiError);
  const defaults = queryClient.getDefaultOptions();
  queryClient.setDefaultOptions({
    ...defaults,
    mutations: { ...defaults.mutations, gcTime: Infinity },
  });
});

afterEach(() => {
  queryClient.clear();
});

/** The auth stack opens on Login, as the signed-out app does. */
async function renderLogin() {
  await renderWithProviders(
    <NavigationContainer>
      <AuthNavigator />
    </NavigationContainer>,
    { queryClient },
  );
}

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
  it('shows V1’s page: wordmark, subtitle, fields, Google and Sign up', async () => {
    await renderLogin();

    expect(screen.getByLabelText('logo')).toBeOnTheScreen();
    expect(screen.getByText('login.subtitle')).toBeOnTheScreen();
    expect(
      screen.getByPlaceholderText('login.email-placeholder'),
    ).toBeOnTheScreen();
    expect(
      screen.getByPlaceholderText('login.password-placeholder'),
    ).toBeOnTheScreen();
    expect(screen.getByText('login.or')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'login.google' })).toBeDisabled();
    expect(
      screen.getByRole('link', { name: 'login.sign-up' }),
    ).toBeOnTheScreen();
  });

  it('signs in with the typed credentials', async () => {
    api.login.mockResolvedValueOnce(token);
    await renderLogin();

    await fillAndSubmit(credentials.email, credentials.password);

    await waitFor(() => {
      expect(authStore.getStatus()).toBe(AUTH_STATUS.AUTHENTICATED);
    });
    expect(api.login).toHaveBeenCalledWith(credentials);
  });

  it('marks invalid fields red without text and does not submit', async () => {
    await renderLogin();

    await fillAndSubmit('not-an-email', '');

    const email = screen.getByLabelText('login.email');
    const password = screen.getByLabelText('login.password');
    await waitFor(() => {
      expect(email.props['aria-invalid']).toBe(true);
    });
    expect(email.props.accessibilityHint).toBe('login.invalid-email');
    expect(password.props['aria-invalid']).toBe(true);
    expect(password.props.accessibilityHint).toBe('login.password-required');
    expect(screen.queryByText('login.invalid-email')).not.toBeOnTheScreen();
    expect(api.login).not.toHaveBeenCalled();
  });

  it('clears a field’s red as soon as it changes', async () => {
    await renderLogin();
    await fillAndSubmit('not-an-email', '');
    await waitFor(() => {
      expect(screen.getByLabelText('login.email').props['aria-invalid']).toBe(
        true,
      );
    });

    await userEvent.type(screen.getByLabelText('login.email'), 'x');

    expect(screen.getByLabelText('login.email').props['aria-invalid']).toBe(
      false,
    );
    expect(screen.getByLabelText('login.password').props['aria-invalid']).toBe(
      true,
    );
  });

  it('shows wrong credentials in the Error dialog and stays signed out', async () => {
    api.login.mockRejectedValueOnce(wrongCredentials);
    await renderLogin();

    await fillAndSubmit(credentials.email, 'wrong-password');

    await waitFor(() => {
      expect(onApiError).toHaveBeenCalledWith(wrongCredentials, undefined);
    });
    expect(authStore.getStatus()).toBe(AUTH_STATUS.ANONYMOUS);
    expect(screen.getByRole('button', { name: 'login.submit' })).toBeEnabled();
  });

  it('disables the button while signing in', async () => {
    let resolveLogin: (value: AccessTokenResponse) => void = () => {};
    api.login.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveLogin = resolve;
      }),
    );
    await renderLogin();

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
    await renderLogin();
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

  it('is not red any more when the user comes back from Sign up', async () => {
    await renderLogin();
    await fillAndSubmit('', '');
    await waitFor(() => {
      expect(screen.getByLabelText('login.email').props['aria-invalid']).toBe(
        true,
      );
    });

    await userEvent.press(screen.getByRole('link', { name: 'login.sign-up' }));
    await userEvent.press(
      await screen.findByRole('link', { name: 'sign-up.log-in' }),
    );

    await waitFor(() => {
      expect(screen.queryByText('sign-up.subtitle')).not.toBeOnTheScreen();
    });
    expect(screen.getByLabelText('login.email').props['aria-invalid']).toBe(
      false,
    );
    expect(screen.getByLabelText('login.password').props['aria-invalid']).toBe(
      false,
    );
  });

  it('opens Sign up from the link', async () => {
    await renderLogin();

    await userEvent.press(screen.getByRole('link', { name: 'login.sign-up' }));

    expect(await screen.findByText('sign-up.subtitle')).toBeOnTheScreen();
  });
});
