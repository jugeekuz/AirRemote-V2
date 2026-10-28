import type { ReactElement, ReactNode } from 'react';
import { View } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderOptions } from '@testing-library/react-native';

import { UiProvider } from '@ui';

/** A fresh client per test: no retries, no GC timers keeping Jest alive. */
export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false, gcTime: Infinity },
    },
  });
}

export function createQueryWrapper(
  queryClient: QueryClient = createTestQueryClient(),
) {
  return function TestProviders({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <UiProvider>{children}</UiProvider>
      </QueryClientProvider>
    );
  };
}

export function renderWithProviders(
  ui: ReactElement,
  {
    queryClient,
    ...options
  }: RenderOptions & { queryClient?: QueryClient } = {},
) {
  return render(ui, { wrapper: createQueryWrapper(queryClient), ...options });
}

type MeasureCallback = (
  x: number,
  y: number,
  width: number,
  height: number,
  pageX: number,
  pageY: number,
) => void;

/**
 * Makes every view report a 40×40 frame at (0, 0) when measured. React
 * Native's Jest mocks never answer `measure`, so popovers that position
 * themselves from their trigger (the kit's `Menu`, `Select`, `Popover`)
 * never open without it. Undo it with `jest.restoreAllMocks()`.
 */
export function mockViewMeasure() {
  const prototype = View.prototype as unknown as {
    measure: (callback: MeasureCallback) => void;
  };
  return jest
    .spyOn(prototype, 'measure')
    .mockImplementation((callback: MeasureCallback) => {
      callback(0, 0, 40, 40, 0, 0);
    });
}

export * from '@testing-library/react-native';
