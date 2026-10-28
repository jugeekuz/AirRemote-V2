import { NavigationContainer } from '@react-navigation/native';
import type { QueryClient } from '@tanstack/react-query';

import type { UserResponse } from '@airremote/contracts';

import type { ApiError } from '@app-types';
import {
  act,
  fireEvent,
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
} from '@utils/tests';
import { usersApi } from '@api/users';
import { createQueryClient } from '@queries/query-client';
import { AUTH_STATUS, authStore } from '@stores/auth';
import AuthNavigator from '@modules/auth/navigation/auth-navigator';

jest.mock('@api/users');

const api = jest.mocked(usersApi);
const form = {
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@example.com',
  password: 'password123',
};
const user: UserResponse = {
  id: '6f1c0d4e-9a43-4c1b-8d4e-2f0a1b2c3d4e',
  email: form.email,
  firstName: form.firstName,
  lastName: form.lastName,
  createdAt: '2026-10-28T10:00:00.000Z',
};
const emailTaken: ApiError = {
  status: 409,
  code: 'EMAIL_TAKEN',
  message: 'Email taken',
  isNetworkError: false,
};

const LABELS = {
  firstName: 'sign-up.first-name',
  lastName: 'sign-up.last-name',
  email: 'sign-up.email',
  password: 'sign-up.password',
  confirmPassword: 'sign-up.confirm-password',
} as const;

type Field = keyof typeof LABELS;

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

/** The auth stack, opened on Sign up alone (as from a `/sign-up` link). */
async function renderSignUp() {
  await renderWithProviders(
    <NavigationContainer initialState={{ routes: [{ name: 'SignUp' }] }}>
      <AuthNavigator />
    </NavigationContainer>,
    { queryClient },
  );
}

function field(name: Field) {
  return screen.getByLabelText(LABELS[name]);
}

function isInvalid(name: Field): boolean {
  return field(name).props['aria-invalid'] === true;
}

async function fill(values: Partial<Record<Field, string>>) {
  const user = userEvent.setup();
  for (const [name, value] of Object.entries(values)) {
    if (value) {
      await user.type(field(name as Field), value);
    }
  }
}

/** Sign up has left the stack and Login shows. */
async function expectLogin() {
  expect(await screen.findByText('login.subtitle')).toBeOnTheScreen();
  await waitFor(() => {
    expect(screen.queryByText('sign-up.subtitle')).not.toBeOnTheScreen();
  });
}

async function submit() {
  await userEvent.press(screen.getByRole('button', { name: 'sign-up.submit' }));
}

describe('SignUpScreen', () => {
  it('shows V1’s page: subtitle, five fields and the Log In link', async () => {
    await renderSignUp();

    expect(screen.getByLabelText('logo')).toBeOnTheScreen();
    expect(screen.getByText('sign-up.subtitle')).toBeOnTheScreen();
    for (const name of Object.keys(LABELS)) {
      expect(field(name as Field)).toBeOnTheScreen();
    }
    expect(
      screen.getByRole('link', { name: 'sign-up.log-in' }),
    ).toBeOnTheScreen();
    // V1's Sign up has no OR row or Google button.
    expect(screen.queryByText('login.or')).not.toBeOnTheScreen();
  });

  it('creates the account, then goes to Login without signing in', async () => {
    api.register.mockResolvedValueOnce(user);
    await renderSignUp();

    await fill({ ...form, confirmPassword: form.password });
    await submit();

    await expectLogin();
    expect(api.register).toHaveBeenCalledWith(form);
    expect(authStore.getStatus()).toBe(AUTH_STATUS.ANONYMOUS);
    expect(onApiError).not.toHaveBeenCalled();
  });

  it('trims the names before sending them', async () => {
    api.register.mockResolvedValueOnce(user);
    await renderSignUp();

    await fill({
      ...form,
      firstName: ' Ada ',
      confirmPassword: form.password,
    });
    await submit();

    await waitFor(() => {
      expect(api.register).toHaveBeenCalledWith(form);
    });
  });

  it('marks every field of an empty form red and does not submit', async () => {
    await renderSignUp();

    await submit();

    await waitFor(() => {
      expect(isInvalid('firstName')).toBe(true);
    });
    expect(isInvalid('lastName')).toBe(true);
    expect(isInvalid('email')).toBe(true);
    expect(isInvalid('password')).toBe(true);
    expect(field('email').props.accessibilityHint).toBe(
      'sign-up.email-invalid',
    );
    expect(screen.queryByText('sign-up.email-invalid')).not.toBeOnTheScreen();
    expect(api.register).not.toHaveBeenCalled();
  });

  it('marks both password fields red when they differ', async () => {
    await renderSignUp();

    await fill({ ...form, confirmPassword: 'password124' });
    await submit();

    await waitFor(() => {
      expect(isInvalid('confirmPassword')).toBe(true);
    });
    expect(isInvalid('password')).toBe(true);
    expect(field('confirmPassword').props.accessibilityHint).toBe(
      'sign-up.confirm-password-invalid',
    );
    expect(isInvalid('firstName')).toBe(false);
    expect(isInvalid('email')).toBe(false);
    expect(api.register).not.toHaveBeenCalled();
  });

  it('clears a field’s red as soon as that field changes', async () => {
    await renderSignUp();
    await submit();
    await waitFor(() => {
      expect(isInvalid('firstName')).toBe(true);
    });

    await fill({ firstName: 'A' });

    expect(isInvalid('firstName')).toBe(false);
    expect(isInvalid('lastName')).toBe(true);
  });

  it('shows a taken email in the Error dialog and stays on Sign up', async () => {
    api.register.mockRejectedValueOnce(emailTaken);
    await renderSignUp();

    await fill({ ...form, confirmPassword: form.password });
    await submit();

    await waitFor(() => {
      expect(onApiError).toHaveBeenCalledWith(emailTaken, undefined);
    });
    expect(screen.getByText('sign-up.subtitle')).toBeOnTheScreen();
    expect(
      screen.getByRole('button', { name: 'sign-up.submit' }),
    ).toBeEnabled();
  });

  // Two Enters (or Enter and a click) before the busy button renders.
  it('sends one request for two submits in the same moment, and takes the next once it failed', async () => {
    api.register.mockRejectedValue(emailTaken);
    await renderSignUp();
    await fill({ ...form, confirmPassword: form.password });

    await act(async () => {
      fireEvent(field('confirmPassword'), 'submitEditing');
      fireEvent(field('confirmPassword'), 'submitEditing');
    });

    await waitFor(() => {
      expect(onApiError).toHaveBeenCalledTimes(1);
    });
    expect(api.register).toHaveBeenCalledTimes(1);

    await act(async () => {
      fireEvent(field('confirmPassword'), 'submitEditing');
    });

    await waitFor(() => {
      expect(api.register).toHaveBeenCalledTimes(2);
    });
  });

  it('is busy while the account is being created', async () => {
    let resolveRegister: (value: UserResponse) => void = () => {};
    api.register.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRegister = resolve;
      }),
    );
    await renderSignUp();

    await fill({ ...form, confirmPassword: form.password });
    await submit();

    const button = screen.getByRole('button', { name: 'sign-up.submit' });
    await waitFor(() => {
      expect(button).toBeBusy();
    });
    expect(button).toBeDisabled();

    resolveRegister(user);
    await expectLogin();
    expect(api.register).toHaveBeenCalledTimes(1);
  });

  it('goes back to Login from the link', async () => {
    await renderSignUp();

    await userEvent.press(screen.getByRole('link', { name: 'sign-up.log-in' }));

    await expectLogin();
  });
});
