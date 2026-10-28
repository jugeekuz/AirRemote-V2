import type { ReactNode } from 'react';
import { Pressable, Text } from 'react-native';
import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
} from '@testing-library/react-native';

import { EditModeProvider, useEditMode } from './edit-mode.context';

function wrapper({ children }: { children: ReactNode }) {
  return <EditModeProvider>{children}</EditModeProvider>;
}

function useEditModeState() {
  return {
    isEditing: useEditMode((state) => state.isEditing),
    toggle: useEditMode((state) => state.toggle),
    stop: useEditMode((state) => state.stop),
  };
}

describe('EditModeProvider', () => {
  it('starts off', async () => {
    const { result } = await renderHook(useEditModeState, { wrapper });

    expect(result.current.isEditing).toBe(false);
  });

  it('turns on and off with toggle', async () => {
    const { result } = await renderHook(useEditModeState, { wrapper });

    await act(async () => {
      result.current.toggle();
    });
    expect(result.current.isEditing).toBe(true);

    await act(async () => {
      result.current.toggle();
    });
    expect(result.current.isEditing).toBe(false);
  });

  it('turns off with stop, and stays off', async () => {
    const { result } = await renderHook(useEditModeState, { wrapper });
    await act(async () => {
      result.current.toggle();
    });

    await act(async () => {
      result.current.stop();
      result.current.stop();
    });

    expect(result.current.isEditing).toBe(false);
  });

  it('gives each provider its own state', async () => {
    function Section({ name }: { name: string }) {
      const isEditing = useEditMode((state) => state.isEditing);
      const toggle = useEditMode((state) => state.toggle);
      return (
        <Pressable accessibilityRole="button" onPress={toggle}>
          <Text>{`${name}: ${String(isEditing)}`}</Text>
        </Pressable>
      );
    }
    await render(
      <>
        <EditModeProvider>
          <Section name="devices" />
        </EditModeProvider>
        <EditModeProvider>
          <Section name="remotes" />
        </EditModeProvider>
      </>,
    );

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'devices: false' }));
    });

    expect(screen.getByText('devices: true')).toBeOnTheScreen();
    expect(screen.getByText('remotes: false')).toBeOnTheScreen();
  });

  it('starts off again when the screen mounts anew', async () => {
    const first = await renderHook(useEditModeState, { wrapper });
    await act(async () => {
      first.result.current.toggle();
    });
    await first.unmount();

    const second = await renderHook(useEditModeState, { wrapper });

    expect(second.result.current.isEditing).toBe(false);
  });

  it('throws outside a provider', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});

    await expect(
      renderHook(() => useEditMode((state) => state.isEditing)),
    ).rejects.toThrow('useEditMode must be used inside <EditModeProvider>.');
  });
});
