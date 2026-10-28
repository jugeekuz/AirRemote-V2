import { StyleSheet } from 'react-native';

import { act, fireEvent, renderWithProviders, screen } from '@utils/tests';

import RemoteNotFound from './remote-not-found';

describe('RemoteNotFound', () => {
  it('says the remote is gone and offers the way back', async () => {
    const onBack = jest.fn();
    await renderWithProviders(<RemoteNotFound onBack={onBack} />);

    expect(screen.getByText('remote-details.not-found')).toBeOnTheScreen();
    await act(async () => {
      fireEvent.press(
        screen.getByRole('button', { name: 'remote-details.back-to-remotes' }),
      );
    });

    expect(onBack).toHaveBeenCalledTimes(1);
  });

  // Not as tall as the window, which made the page scroll under the toolbar.
  it('fills the space it is given instead of a fixed height', async () => {
    await renderWithProviders(<RemoteNotFound onBack={jest.fn()} />);

    const style = StyleSheet.flatten(
      screen.getByTestId('remote-not-found').props.style,
    );
    expect(style?.height).toBeUndefined();
  });
});
