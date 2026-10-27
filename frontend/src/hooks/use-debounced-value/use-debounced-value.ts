import { useEffect, useState } from 'react';

import { DEFAULT_DEBOUNCE_MS } from './use-debounced-value.constants';

/** `value`, once it has stopped changing for `delayMs` (e.g. a search field). */
export function useDebouncedValue<TValue>(
  value: TValue,
  delayMs: number = DEFAULT_DEBOUNCE_MS,
): TValue {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedValue(value);
    }, delayMs);
    return () => {
      clearTimeout(timeout);
    };
  }, [value, delayMs]);

  return debouncedValue;
}
