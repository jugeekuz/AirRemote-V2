import type { DeviceResponse, RemoteResponse } from '@airremote/contracts';

import { renderWithProviders, screen } from '@utils/tests';

import InfoBar from './info-bar';

const desk: DeviceResponse = {
  id: '6f1c0d4e-9a43-4c1b-8d4e-2f0a1b2c3d4e',
  macAddress: 'aa:bb:cc:dd:ee:01',
  name: 'Desk ESP32',
  online: true,
};
const ac: RemoteResponse = {
  id: '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d',
  deviceId: desk.id,
  name: 'Living Room AC',
  type: 'air_conditioner',
};

describe('InfoBar', () => {
  it('shows the remote, its type, its device and that it is connected', async () => {
    await renderWithProviders(<InfoBar remote={ac} device={desk} />);

    expect(screen.getByText('Living Room AC')).toBeOnTheScreen();
    expect(screen.getByText('remote-type.air-conditioner')).toBeOnTheScreen();
    expect(screen.getByText('Desk ESP32')).toBeOnTheScreen();
    expect(screen.getByText('info-bar.online')).toBeOnTheScreen();
    expect(
      screen.getByRole('image', {
        name: 'status-dot.online',
        includeHiddenElements: true,
      }),
    ).toBeTruthy();
  });

  // V1 showed what its backend stored, upper-case; V2 stores lower-case.
  it('shows the MAC address upper-case', async () => {
    await renderWithProviders(<InfoBar remote={ac} device={desk} />);

    expect(screen.getByText('AA:BB:CC:DD:EE:01')).toBeOnTheScreen();
  });

  it('says Disconnected with a red dot when the device is offline', async () => {
    await renderWithProviders(
      <InfoBar remote={ac} device={{ ...desk, online: false }} />,
    );

    expect(screen.getByText('info-bar.offline')).toBeOnTheScreen();
    expect(
      screen.getByRole('image', {
        name: 'status-dot.offline',
        includeHiddenElements: true,
      }),
    ).toBeTruthy();
  });

  it("shows the type's dark picture, as tall as its row", async () => {
    await renderWithProviders(<InfoBar remote={ac} device={desk} />);

    expect(screen.getByTestId('info-bar-picture')).toHaveStyle({
      aspectRatio: 800 / 408,
    });
  });

  it("shows V1's Loading.. in every field while it loads", async () => {
    await renderWithProviders(
      <InfoBar remote={undefined} device={undefined} />,
    );

    expect(screen.getAllByText('info-bar.loading')).toHaveLength(5);
    expect(screen.queryByTestId('info-bar-picture')).not.toBeOnTheScreen();
    expect(
      screen.queryByRole('image', {
        name: /status-dot/,
        includeHiddenElements: true,
      }),
    ).not.toBeOnTheScreen();
  });

  it("shows the remote while its device's details still load", async () => {
    await renderWithProviders(<InfoBar remote={ac} device={undefined} />);

    expect(screen.getByText('Living Room AC')).toBeOnTheScreen();
    expect(screen.getAllByText('info-bar.loading')).toHaveLength(3);
  });
});
