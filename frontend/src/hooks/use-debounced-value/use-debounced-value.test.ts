import { act, renderHook } from '@utils/tests';

import { useDebouncedValue } from './use-debounced-value';
import { DEFAULT_DEBOUNCE_MS } from './use-debounced-value.constants';

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

async function renderDebounced(initialValue: string, delayMs?: number) {
  return renderHook(
    ({ value }: { value: string }) => useDebouncedValue(value, delayMs),
    { initialProps: { value: initialValue } },
  );
}

describe('useDebouncedValue', () => {
  it('returns the first value right away', async () => {
    const { result } = await renderDebounced('a');

    expect(result.current).toBe('a');
  });

  it('updates only after the delay', async () => {
    const { result, rerender } = await renderDebounced('a', 500);

    await rerender({ value: 'b' });
    await act(async () => {
      jest.advanceTimersByTime(499);
    });
    expect(result.current).toBe('a');

    await act(async () => {
      jest.advanceTimersByTime(1);
    });
    expect(result.current).toBe('b');
  });

  it('waits the default delay when none is given', async () => {
    const { result, rerender } = await renderDebounced('a');

    await rerender({ value: 'b' });
    await act(async () => {
      jest.advanceTimersByTime(DEFAULT_DEBOUNCE_MS - 1);
    });
    expect(result.current).toBe('a');

    await act(async () => {
      jest.advanceTimersByTime(1);
    });
    expect(result.current).toBe('b');
  });

  it('restarts the delay on a new value', async () => {
    const { result, rerender } = await renderDebounced('a', 500);

    await rerender({ value: 'b' });
    await act(async () => {
      jest.advanceTimersByTime(400);
    });
    await rerender({ value: 'c' });
    await act(async () => {
      jest.advanceTimersByTime(400);
    });
    expect(result.current).toBe('a');

    await act(async () => {
      jest.advanceTimersByTime(100);
    });
    expect(result.current).toBe('c');
  });

  it('clears its timer on unmount', async () => {
    // React keeps timers of its own, so follow the debounce timer by its id.
    const setTimeoutSpy = jest.spyOn(globalThis, 'setTimeout');
    const clearTimeoutSpy = jest.spyOn(globalThis, 'clearTimeout');
    const { rerender, unmount } = await renderDebounced('a', 500);
    await rerender({ value: 'b' });
    const debounceCalls = setTimeoutSpy.mock.calls.flatMap(
      ([, delay], index) =>
        delay === 500 ? [setTimeoutSpy.mock.results[index]?.value] : [],
    );
    const pendingTimer = debounceCalls.at(-1);
    expect(clearTimeoutSpy).not.toHaveBeenCalledWith(pendingTimer);

    await unmount();

    expect(clearTimeoutSpy).toHaveBeenCalledWith(pendingTimer);
    setTimeoutSpy.mockRestore();
    clearTimeoutSpy.mockRestore();
  });
});
