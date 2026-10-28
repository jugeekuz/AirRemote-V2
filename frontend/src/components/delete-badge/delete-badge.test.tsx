import { act, fireEvent, renderWithProviders, screen } from '@utils/tests';

import DeleteBadge from './delete-badge';

async function pressDelete() {
  await act(async () => {
    fireEvent.press(screen.getByRole('button', { name: 'delete' }));
  });
}

describe('DeleteBadge', () => {
  it("asks V1's confirmation before deleting", async () => {
    const onConfirm = jest.fn();
    await renderWithProviders(
      <DeleteBadge position="left" onConfirm={onConfirm} />,
    );

    await pressDelete();

    expect(
      screen.getByRole('heading', { name: 'confirm.title' }),
    ).toBeOnTheScreen();
    expect(screen.getByText('confirm.delete')).toBeOnTheScreen();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('deletes on Yes', async () => {
    const onConfirm = jest.fn();
    await renderWithProviders(
      <DeleteBadge position="right" onConfirm={onConfirm} />,
    );
    await pressDelete();

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'yes' }));
    });

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('confirm.delete')).not.toBeOnTheScreen();
  });

  it('does nothing on No', async () => {
    const onConfirm = jest.fn();
    await renderWithProviders(
      <DeleteBadge position="left" onConfirm={onConfirm} />,
    );
    await pressDelete();

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'no' }));
    });

    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.queryByText('confirm.delete')).not.toBeOnTheScreen();
  });
});
