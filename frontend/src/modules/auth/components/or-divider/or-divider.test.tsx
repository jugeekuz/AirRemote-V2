import { renderWithProviders, screen } from '@utils/tests';

import OrDivider from './or-divider';

describe('OrDivider', () => {
  it('says OR between the two lines', async () => {
    await renderWithProviders(<OrDivider />);

    expect(screen.getByText('login.or')).toBeOnTheScreen();
  });
});
