import { Text } from 'react-native';

import { renderWithProviders, screen } from '@utils/tests';

import Screen from './screen';

function edgesOf(testID: string): unknown {
  return screen.getByTestId(testID).props.edges;
}

describe('Screen', () => {
  it('shows its content', async () => {
    await renderWithProviders(
      <Screen>
        <Text>content</Text>
      </Screen>,
    );

    expect(screen.getByText('content')).toBeOnTheScreen();
  });

  // The tab bar already pads the bottom of the tab screens.
  it('keeps clear of the status bar and the sides, not the bottom', async () => {
    await renderWithProviders(
      <Screen>
        <Text>content</Text>
      </Screen>,
    );

    expect(edgesOf('screen-safe-area')).toEqual({
      top: 'additive',
      left: 'additive',
      right: 'additive',
      bottom: 'off',
    });
  });

  it('keeps clear of the bottom too on a screen without the tab bar', async () => {
    await renderWithProviders(
      <Screen hasBottomInset>
        <Text>content</Text>
      </Screen>,
    );

    expect(edgesOf('screen-safe-area')).toEqual({
      top: 'additive',
      left: 'additive',
      right: 'additive',
      bottom: 'additive',
    });
  });
});
