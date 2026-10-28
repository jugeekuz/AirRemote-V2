import { render, screen } from '@testing-library/react-native';
import { Pencil } from 'lucide-react-native';

import Icon from './icon';

describe('Icon', () => {
  it('draws the glyph at the given size and stroke', async () => {
    await render(
      <Icon as={Pencil} size={18} strokeWidth={2.5} testID="icon" />,
    );

    const svg = screen.getByTestId('icon', { includeHiddenElements: true });
    expect(svg.props.width).toBe(18);
    expect(svg.props.height).toBe(18);
    expect(svg).toBeOnTheScreen();
  });

  it('is hidden from screen readers: the control around it is named', async () => {
    await render(<Icon as={Pencil} testID="icon" />);

    expect(
      screen.getByTestId('icon', { includeHiddenElements: true }),
    ).toBeOnTheScreen();
    expect(screen.queryByTestId('icon')).not.toBeOnTheScreen();
  });
});
