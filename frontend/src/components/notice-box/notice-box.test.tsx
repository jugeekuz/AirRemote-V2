import { renderWithProviders, screen } from '@utils/tests';

import NoticeBox from './notice-box';

describe('NoticeBox', () => {
  it('shows its text', async () => {
    await renderWithProviders(
      <NoticeBox>Devices refresh every 30 s.</NoticeBox>,
    );

    expect(screen.getByText('Devices refresh every 30 s.')).toBeOnTheScreen();
  });
});
