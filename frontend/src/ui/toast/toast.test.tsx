import { View } from 'react-native';
import { act, render, screen } from '@testing-library/react-native';

import { UiProvider } from '@ui/ui-provider';

import { registerToastSink, toast } from './toast';

const fakeSink = () => ({ success: jest.fn(), error: jest.fn() });

describe('toast', () => {
  it('shows an error through the mounted bridge', async () => {
    await render(
      <UiProvider>
        <View />
      </UiProvider>,
    );

    await act(async () => {
      toast.error('Boom');
    });

    expect(screen.getByText('Boom')).toBeOnTheScreen();
  });

  it('drops a toast when no bridge is mounted', () => {
    expect(() => toast.error('x')).not.toThrow();
  });

  it('stops using a bridge after it unmounts', async () => {
    const { unmount } = await render(
      <UiProvider>
        <View />
      </UiProvider>,
    );
    await unmount();

    expect(() => toast.error('x')).not.toThrow();
    expect(screen.queryByText('x')).not.toBeOnTheScreen();
  });

  it('stops sending to a sink once it is unregistered', () => {
    const sink = fakeSink();
    const unregister = registerToastSink(sink);
    unregister();

    toast.error('x');

    expect(sink.error).not.toHaveBeenCalled();
  });

  it('keeps a newer sink when an older one unregisters', () => {
    const older = fakeSink();
    const newer = fakeSink();
    const unregisterOlder = registerToastSink(older);
    const unregisterNewer = registerToastSink(newer);
    unregisterOlder();

    toast.success('Saved');

    expect(newer.success).toHaveBeenCalledWith('Saved');
    expect(older.success).not.toHaveBeenCalled();
    unregisterNewer();
  });
});
