import type { ButtonResponse } from '@airremote/contracts';

import { act, fireEvent, renderWithProviders, screen } from '@utils/tests';

import ButtonTile from './button-tile';

jest.mock('@api/buttons');

const power: ButtonResponse = {
  id: '3c2b1a09-8f7e-4d6c-9b5a-4f3e2d1c0b9a',
  remoteId: '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d',
  name: 'Power',
};
const DELETE_POWER = 'button-tile.delete | name: Power';

type Props = Partial<Parameters<typeof ButtonTile>[0]>;

async function renderTile(props: Props = {}) {
  await renderWithProviders(
    <ButtonTile
      button={power}
      isEditing={false}
      onDelete={jest.fn()}
      {...props}
    />,
  );
}

async function press(name: string) {
  await act(async () => {
    fireEvent.press(screen.getByRole('button', { name }));
  });
}

describe('ButtonTile', () => {
  it('shows the name and its press control, with no State line', async () => {
    await renderTile();

    expect(screen.getByText('Power')).toBeOnTheScreen();
    expect(
      screen.getByRole('button', { name: 'press-button.label | name: Power' }),
    ).toBeOnTheScreen();
    expect(screen.queryByText(/State/)).not.toBeOnTheScreen();
  });

  it('shows no delete badge outside edit mode', async () => {
    await renderTile();

    expect(
      screen.queryByRole('button', { name: DELETE_POWER }),
    ).not.toBeOnTheScreen();
  });

  it('deletes the button after the confirmation in edit mode', async () => {
    const onDelete = jest.fn();
    await renderTile({ isEditing: true, onDelete });

    await press(DELETE_POWER);
    expect(screen.getByText('confirm.delete')).toBeOnTheScreen();
    await press('yes');

    expect(onDelete).toHaveBeenCalledWith(power.id);
  });

  it('keeps the press control in edit mode, as V1 did', async () => {
    await renderTile({ isEditing: true });

    expect(
      screen.getByRole('button', { name: 'press-button.label | name: Power' }),
    ).toBeOnTheScreen();
  });
});
