import { mockViewMeasure, renderWithProviders, screen } from '@utils/tests';

import DeviceListScreen from './device-list-screen';

jest.mock('@api/auth');

beforeEach(() => {
  mockViewMeasure();
});

describe('DeviceListScreen', () => {
  it('shows the toolbar and its title', async () => {
    await renderWithProviders(<DeviceListScreen />);

    expect(screen.getByText('device-list.title')).toBeOnTheScreen();
    expect(
      screen.getByRole('button', { name: 'top-toolbar.account' }),
    ).toBeOnTheScreen();
  });
});
