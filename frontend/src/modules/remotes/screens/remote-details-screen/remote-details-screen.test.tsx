import { useNavigation } from '@react-navigation/native';

import {
  mockViewMeasure,
  renderWithProviders,
  screen,
  userEvent,
} from '@utils/tests';

import RemoteDetailsScreen from './remote-details-screen';

jest.mock('@api/auth');
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual<object>('@react-navigation/native'),
  useNavigation: jest.fn(),
}));

const goBack = jest.fn();

beforeEach(() => {
  mockViewMeasure();
  jest.mocked(useNavigation).mockReturnValue({
    goBack,
  } as unknown as ReturnType<typeof useNavigation>);
});

describe('RemoteDetailsScreen', () => {
  it('shows its title and goes back from the toolbar', async () => {
    await renderWithProviders(<RemoteDetailsScreen />);

    expect(screen.getByText('remote-details.title')).toBeOnTheScreen();
    await userEvent.press(
      screen.getByRole('button', { name: 'top-toolbar.back' }),
    );

    expect(goBack).toHaveBeenCalledTimes(1);
  });
});
