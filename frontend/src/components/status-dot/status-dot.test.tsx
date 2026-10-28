import { renderWithProviders, screen } from '@utils/tests';

import StatusDot from './status-dot';

describe('StatusDot', () => {
  it('says the device is connected when it is online', async () => {
    await renderWithProviders(<StatusDot online />);

    expect(screen.getByLabelText('status-dot.online')).toBeOnTheScreen();
  });

  it('says the device is disconnected when it is offline', async () => {
    await renderWithProviders(<StatusDot online={false} />);

    expect(screen.getByLabelText('status-dot.offline')).toBeOnTheScreen();
  });
});
