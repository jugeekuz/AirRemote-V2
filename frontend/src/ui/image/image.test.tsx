import { render, screen } from '@testing-library/react-native';

import Image from './image';

describe('Image', () => {
  it('renders a picture with its accessible name', async () => {
    await render(
      <Image source={1} accessibilityLabel="AirRemote" className="size-10" />,
    );

    expect(screen.getByLabelText('AirRemote')).toBeOnTheScreen();
  });
});
