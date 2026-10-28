import { useCallback, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';

/** Refetches when the screen regains focus (skips the first focus: the mount already fetched). */
export function useRefreshOnFocus(refetch: () => unknown): void {
  const isFirstFocusRef = useRef(true);

  useFocusEffect(
    useCallback(() => {
      if (isFirstFocusRef.current) {
        isFirstFocusRef.current = false;
        return;
      }
      refetch();
    }, [refetch]),
  );
}
