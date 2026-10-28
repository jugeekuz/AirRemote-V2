import {
  act,
  fireEvent,
  mockViewMeasure,
  renderWithProviders,
  screen,
  waitFor,
} from '@utils/tests';
import { authApi } from '@api/auth';
import { AUTH_STATUS, authStore } from '@stores/auth';

import TopToolbar from './top-toolbar';

jest.mock('@api/auth');

const api = jest.mocked(authApi);

beforeEach(() => {
  jest.resetAllMocks();
  authStore.reset();
  authStore.signIn('token-1');
  mockViewMeasure();
});

afterEach(() => {
  jest.restoreAllMocks();
});

async function openAccountMenu() {
  await act(async () => {
    fireEvent.press(
      screen.getByRole('button', { name: 'top-toolbar.account' }),
    );
  });
  // The menu takes presses once it has been laid out on the screen; Jest
  // never lays anything out, so its items' container reports a frame.
  const menu = (
    await screen.findByRole('menuitem', { name: 'top-toolbar.logout' })
  ).parent;
  if (!menu) {
    throw new Error('The menu items have no container.');
  }
  await act(async () => {
    fireEvent(menu, 'layout', {
      nativeEvent: { layout: { x: 0, y: 64, width: 200, height: 80 } },
    });
  });
}

describe('TopToolbar', () => {
  it('shows the logo and no back button on a top-level screen', async () => {
    await renderWithProviders(<TopToolbar />);

    expect(screen.getByLabelText('top-toolbar.logo')).toBeOnTheScreen();
    expect(
      screen.queryByRole('button', { name: 'top-toolbar.back' }),
    ).not.toBeOnTheScreen();
  });

  it('shows a back button instead of the logo when it can go back', async () => {
    const onBack = jest.fn();
    await renderWithProviders(<TopToolbar onBack={onBack} />);

    expect(screen.queryByLabelText('top-toolbar.logo')).not.toBeOnTheScreen();
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'top-toolbar.back' }));
    });

    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('offers "Invite a friend", disabled, in the account menu', async () => {
    await renderWithProviders(<TopToolbar />);

    await openAccountMenu();

    expect(
      await screen.findByRole('menuitem', {
        name: 'top-toolbar.invite-friend',
      }),
    ).toBeDisabled();
  });

  it('logs out from the account menu', async () => {
    api.logout.mockResolvedValueOnce(undefined);
    await renderWithProviders(<TopToolbar />);
    await openAccountMenu();

    await act(async () => {
      fireEvent.press(
        await screen.findByRole('menuitem', { name: 'top-toolbar.logout' }),
      );
    });

    await waitFor(() => {
      expect(authStore.getStatus()).toBe(AUTH_STATUS.ANONYMOUS);
    });
    expect(api.logout).toHaveBeenCalledTimes(1);
  });
});
