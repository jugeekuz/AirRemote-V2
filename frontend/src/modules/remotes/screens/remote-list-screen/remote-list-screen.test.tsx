import { mockViewMeasure, renderWithProviders, screen } from '@utils/tests';

import RemoteListScreen from './remote-list-screen';

jest.mock('@api/auth');

beforeEach(() => {
  mockViewMeasure();
});

describe('RemoteListScreen', () => {
  it('shows the toolbar and its title', async () => {
    await renderWithProviders(<RemoteListScreen />);

    expect(screen.getByText('remote-list.title')).toBeOnTheScreen();
    expect(
      screen.getByRole('button', { name: 'top-toolbar.account' }),
    ).toBeOnTheScreen();
  });
});
