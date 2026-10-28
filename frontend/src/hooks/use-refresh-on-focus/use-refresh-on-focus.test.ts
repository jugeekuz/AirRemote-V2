import { useFocusEffect } from '@react-navigation/native';

import { act, renderHook } from '@utils/tests';

import { useRefreshOnFocus } from './use-refresh-on-focus';

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: jest.fn(),
}));

// The mock keeps the latest focus callback; `focus()` stands in for the
// screen gaining focus.
let focusCallback: () => void = () => {};
jest.mocked(useFocusEffect).mockImplementation((callback) => {
  focusCallback = () => {
    callback();
  };
});

async function focus() {
  await act(async () => {
    focusCallback();
  });
}

describe('useRefreshOnFocus', () => {
  it('skips the first focus and refetches on the next ones', async () => {
    const refetch = jest.fn();
    await renderHook(() => {
      useRefreshOnFocus(refetch);
    });

    await focus();
    expect(refetch).not.toHaveBeenCalled();

    await focus();
    expect(refetch).toHaveBeenCalledTimes(1);

    await focus();
    expect(refetch).toHaveBeenCalledTimes(2);
  });
});
