import { renderWithProviders, screen } from '@utils/tests';

import TintedSpinner from './tinted-spinner';

describe('TintedSpinner', () => {
  it("shows the kit's spinner at the given size", async () => {
    await renderWithProviders(
      <TintedSpinner size="lg" colorClassName="text-zinc-300" testID="busy" />,
    );

    expect(screen.getByTestId('busy')).toBeOnTheScreen();
  });
});
