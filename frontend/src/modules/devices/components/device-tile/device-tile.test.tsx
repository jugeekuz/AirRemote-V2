import type { DeviceResponse } from '@airremote/contracts';

import { act, fireEvent, renderWithProviders, screen } from '@utils/tests';

import DeviceTile from './device-tile';

const desk: DeviceResponse = {
  id: '6f1c0d4e-9a43-4c1b-8d4e-2f0a1b2c3d4e',
  macAddress: 'aa:bb:cc:dd:ee:01',
  name: 'Desk',
  online: true,
};
const DELETE_DESK = 'device-tile.delete | name: Desk';

describe('DeviceTile', () => {
  it('shows the name and that the device is connected', async () => {
    await renderWithProviders(
      <DeviceTile device={desk} isEditing={false} onDelete={jest.fn()} />,
    );

    expect(screen.getByText('Desk')).toBeOnTheScreen();
    expect(screen.getByText('device-tile.online')).toBeOnTheScreen();
  });

  it('says when the device is disconnected', async () => {
    await renderWithProviders(
      <DeviceTile
        device={{ ...desk, online: false }}
        isEditing={false}
        onDelete={jest.fn()}
      />,
    );

    expect(screen.getByText('device-tile.offline')).toBeOnTheScreen();
  });

  // The text already says it; the dot would be read a second time.
  it('hides the status dot from screen readers', async () => {
    await renderWithProviders(
      <DeviceTile device={desk} isEditing={false} onDelete={jest.fn()} />,
    );

    expect(
      screen.queryByRole('image', { name: 'status-dot.online' }),
    ).not.toBeOnTheScreen();
    expect(
      screen.getByRole('image', {
        name: 'status-dot.online',
        includeHiddenElements: true,
      }),
    ).toBeTruthy();
  });

  it('offers no delete outside edit mode', async () => {
    await renderWithProviders(
      <DeviceTile device={desk} isEditing={false} onDelete={jest.fn()} />,
    );

    expect(
      screen.queryByRole('button', { name: DELETE_DESK }),
    ).not.toBeOnTheScreen();
  });

  it('deletes the device in edit mode once the user confirms', async () => {
    const onDelete = jest.fn();
    await renderWithProviders(
      <DeviceTile device={desk} isEditing onDelete={onDelete} />,
    );

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: DELETE_DESK }));
    });
    expect(screen.getByText('confirm.delete')).toBeOnTheScreen();
    expect(onDelete).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'yes' }));
    });

    expect(onDelete).toHaveBeenCalledWith(desk.id);
  });
});
