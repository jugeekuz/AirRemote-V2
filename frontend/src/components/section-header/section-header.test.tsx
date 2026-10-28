import { act, fireEvent, renderWithProviders, screen } from '@utils/tests';

import SectionHeader from './section-header';

async function renderHeader(count?: number) {
  const onAdd = jest.fn();
  const onToggleEdit = jest.fn();
  await renderWithProviders(
    <SectionHeader
      title="Your Devices"
      count={count}
      onAdd={onAdd}
      onToggleEdit={onToggleEdit}
    />,
  );
  return { onAdd, onToggleEdit };
}

describe('SectionHeader', () => {
  it('shows the title as a heading and the count', async () => {
    await renderHeader(3);

    expect(
      screen.getByRole('header', { name: 'Your Devices' }),
    ).toBeOnTheScreen();
    expect(screen.getByText('3')).toBeOnTheScreen();
  });

  it('shows an empty badge while the count is unknown', async () => {
    await renderHeader(undefined);

    expect(screen.queryByText('0')).not.toBeOnTheScreen();
  });

  it('adds with the plus button', async () => {
    const { onAdd, onToggleEdit } = await renderHeader(0);

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'add' }));
    });

    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onToggleEdit).not.toHaveBeenCalled();
  });

  it('toggles edit mode with the pencil', async () => {
    const { onAdd, onToggleEdit } = await renderHeader(0);

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'edit' }));
    });

    expect(onToggleEdit).toHaveBeenCalledTimes(1);
    expect(onAdd).not.toHaveBeenCalled();
  });
});
