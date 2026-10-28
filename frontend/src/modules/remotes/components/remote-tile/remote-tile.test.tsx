import type { DeviceResponse, RemoteResponse } from '@airremote/contracts';

import { act, fireEvent, renderWithProviders, screen } from '@utils/tests';

import RemoteTile from './remote-tile';

const desk: DeviceResponse = {
  id: '6f1c0d4e-9a43-4c1b-8d4e-2f0a1b2c3d4e',
  macAddress: 'aa:bb:cc:dd:ee:01',
  name: 'Desk',
  online: true,
};
const ac: RemoteResponse = {
  id: '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d',
  deviceId: desk.id,
  name: 'Living room AC',
  type: 'air_conditioner',
};
const OPEN_AC = 'remote-tile.open | name: Living room AC';
const DELETE_AC = 'remote-tile.delete | name: Living room AC';

type Props = Partial<Parameters<typeof RemoteTile>[0]>;

async function renderTile(props: Props = {}) {
  await renderWithProviders(
    <RemoteTile
      remote={ac}
      device={desk}
      isEditing={false}
      onOpen={jest.fn()}
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

describe('RemoteTile', () => {
  it("shows the name and the type's label", async () => {
    await renderTile();

    expect(screen.getByText('Living room AC')).toBeOnTheScreen();
    expect(screen.getByText('remote-type.air-conditioner')).toBeOnTheScreen();
  });

  it("shows whether the remote's device is online", async () => {
    await renderTile();
    expect(
      screen.getByRole('image', {
        name: 'status-dot.online',
        includeHiddenElements: true,
      }),
    ).toBeTruthy();
  });

  it('shows a red dot for a device that is offline', async () => {
    await renderTile({ device: { ...desk, online: false } });

    expect(
      screen.getByRole('image', {
        name: 'status-dot.offline',
        includeHiddenElements: true,
      }),
    ).toBeTruthy();
  });

  it('shows no dot while its device is unknown', async () => {
    await renderTile({ device: undefined });

    expect(
      screen.queryByRole('image', {
        name: /status-dot/,
        includeHiddenElements: true,
      }),
    ).not.toBeOnTheScreen();
  });

  // Which picture per type is the helper's test (Jest stubs every file).
  it("shows the type's picture, placed as V1 did", async () => {
    await renderTile({ remote: { ...ac, type: 'dehumidifier' } });

    const picture = screen.getByTestId('remote-tile-picture');
    expect(picture).toHaveProp('contentFit', 'contain');
    expect(picture).toHaveProp('contentPosition', { bottom: 0, left: 0 });
  });

  it('opens the remote from anywhere on the tile', async () => {
    const onOpen = jest.fn();
    await renderTile({ onOpen });

    await press(OPEN_AC);

    expect(onOpen).toHaveBeenCalledWith(ac.id);
  });

  it('offers no delete outside edit mode', async () => {
    await renderTile();

    expect(
      screen.queryByRole('button', { name: DELETE_AC }),
    ).not.toBeOnTheScreen();
  });

  it('deletes the remote after the confirmation in edit mode', async () => {
    const onDelete = jest.fn();
    await renderTile({ isEditing: true, onDelete });

    await press(DELETE_AC);
    expect(screen.getByText('confirm.delete')).toBeOnTheScreen();
    await press('yes');

    expect(onDelete).toHaveBeenCalledWith(ac.id);
  });

  // As V1: the open control works in edit mode too.
  it('still opens the remote in edit mode', async () => {
    const onOpen = jest.fn();
    await renderTile({ isEditing: true, onOpen });

    await press(OPEN_AC);

    expect(onOpen).toHaveBeenCalledWith(ac.id);
  });
});
