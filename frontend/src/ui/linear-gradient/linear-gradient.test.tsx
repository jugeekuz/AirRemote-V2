import { Text } from 'react-native';
import { render, screen } from '@testing-library/react-native';

import LinearGradient from './linear-gradient';

describe('LinearGradient', () => {
  it('runs from the bottom-left to the top-right corner for to-tr', async () => {
    await render(
      <LinearGradient
        fromColorClassName="text-blue-500"
        toColorClassName="text-blue-700"
        direction="to-tr"
        testID="gradient"
      />,
    );

    const gradient = screen.getByTestId('gradient');
    expect(gradient.props.startPoint).toEqual([0, 1]);
    expect(gradient.props.endPoint).toEqual([1, 0]);
    expect(gradient.props.colors).toHaveLength(2);
  });

  it('renders its children over the gradient', async () => {
    await render(
      <LinearGradient
        fromColorClassName="text-blue-500"
        toColorClassName="text-blue-700"
      >
        <Text>Log In</Text>
      </LinearGradient>,
    );

    expect(screen.getByText('Log In')).toBeOnTheScreen();
  });
});
