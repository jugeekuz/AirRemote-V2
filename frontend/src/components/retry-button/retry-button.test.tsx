import { act, fireEvent, renderWithProviders, screen } from '@utils/tests';

import RetryButton from './retry-button';

describe('RetryButton', () => {
  it('is a "Try again" button that calls back when pressed', async () => {
    const onPress = jest.fn();
    await renderWithProviders(<RetryButton onPress={onPress} />);

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'try-again' }));
    });

    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
