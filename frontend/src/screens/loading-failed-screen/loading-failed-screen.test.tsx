import { renderWithProviders, screen, userEvent } from '@utils/tests';

import LoadingFailedScreen from './loading-failed-screen';

describe('LoadingFailedScreen', () => {
  it('says the app could not connect', async () => {
    await renderWithProviders(<LoadingFailedScreen onRetry={jest.fn()} />);

    expect(screen.getByText('loading-failed.title')).toBeOnTheScreen();
    expect(screen.getByText('loading-failed.message')).toBeOnTheScreen();
  });

  it('calls onRetry when Retry is pressed', async () => {
    const onRetry = jest.fn();
    await renderWithProviders(<LoadingFailedScreen onRetry={onRetry} />);

    await userEvent.press(screen.getByRole('button', { name: 'retry' }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
