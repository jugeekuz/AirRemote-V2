import { View } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { UiProvider } from '@ui/ui-provider';

import { alert, registerAlertSink } from './alert';

const CONFIRM_DELETE = {
  title: 'Confirmation',
  message: 'Delete it?',
  confirmLabel: 'Yes',
  cancelLabel: 'No',
};

async function renderProvider() {
  return render(
    <UiProvider>
      <View />
    </UiProvider>,
  );
}

describe('alert.error', () => {
  it("shows V1's Error dialog with the message and an OK button", async () => {
    await renderProvider();

    await act(async () => {
      alert.error('The device is offline.');
    });

    expect(
      screen.getByRole('heading', { name: 'alert.error-title' }),
    ).toBeOnTheScreen();
    expect(screen.getByText('The device is offline.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'ok' })).toBeOnTheScreen();
  });

  it('closes when OK is pressed', async () => {
    await renderProvider();
    await act(async () => {
      alert.error('Boom');
    });

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'ok' }));
    });

    expect(screen.queryByText('Boom')).not.toBeOnTheScreen();
  });

  it('shows several errors one at a time, in order', async () => {
    await renderProvider();

    await act(async () => {
      alert.error('First');
      alert.error('Second');
    });

    expect(screen.getByText('First')).toBeOnTheScreen();
    expect(screen.queryByText('Second')).not.toBeOnTheScreen();

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'ok' }));
    });

    expect(screen.queryByText('First')).not.toBeOnTheScreen();
    expect(screen.getByText('Second')).toBeOnTheScreen();
  });

  it('shows a message once while it is already waiting', async () => {
    await renderProvider();

    await act(async () => {
      alert.error('Offline');
      alert.error('Offline');
    });
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'ok' }));
    });

    expect(screen.queryByText('Offline')).not.toBeOnTheScreen();
  });

  it('drops an error when no bridge is mounted', async () => {
    expect(() => alert.error('Lost')).not.toThrow();

    await renderProvider();

    expect(screen.queryByText('Lost')).not.toBeOnTheScreen();
  });

  it('stops sending to a sink once it is unregistered', () => {
    const sink = jest.fn();
    const unregister = registerAlertSink(sink);
    unregister();

    alert.error('x');

    expect(sink).not.toHaveBeenCalled();
  });

  it('keeps a newer sink when an older one unregisters', () => {
    const older = jest.fn();
    const newer = jest.fn();
    const unregisterOlder = registerAlertSink(older);
    const unregisterNewer = registerAlertSink(newer);
    unregisterOlder();

    alert.error('x');

    expect(newer).toHaveBeenCalledTimes(1);
    expect(older).not.toHaveBeenCalled();
    unregisterNewer();
  });
});

describe('alert.confirm', () => {
  it('asks with the given texts and resolves true on the confirm button', async () => {
    await renderProvider();

    let answer: Promise<boolean> = Promise.resolve(false);
    await act(async () => {
      answer = alert.confirm(CONFIRM_DELETE);
    });

    expect(
      screen.getByRole('heading', { name: 'Confirmation' }),
    ).toBeOnTheScreen();
    expect(screen.getByText('Delete it?')).toBeOnTheScreen();
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Yes' }));
    });

    await expect(answer).resolves.toBe(true);
    expect(screen.queryByText('Delete it?')).not.toBeOnTheScreen();
  });

  it('resolves false on the cancel button', async () => {
    await renderProvider();

    let answer: Promise<boolean> = Promise.resolve(true);
    await act(async () => {
      answer = alert.confirm(CONFIRM_DELETE);
    });
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'No' }));
    });

    await expect(answer).resolves.toBe(false);
  });

  it('waits behind an error that is already showing', async () => {
    await renderProvider();

    await act(async () => {
      alert.error('Boom');
      void alert.confirm(CONFIRM_DELETE);
    });

    expect(screen.queryByText('Delete it?')).not.toBeOnTheScreen();
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'ok' }));
    });
    expect(screen.getByText('Delete it?')).toBeOnTheScreen();
  });

  it('resolves false without a bridge', async () => {
    await expect(alert.confirm(CONFIRM_DELETE)).resolves.toBe(false);
  });

  it('resolves false when the bridge unmounts', async () => {
    const { unmount } = await renderProvider();

    let answer: Promise<boolean> = Promise.resolve(true);
    await act(async () => {
      answer = alert.confirm(CONFIRM_DELETE);
    });
    await unmount();

    await expect(answer).resolves.toBe(false);
  });
});
