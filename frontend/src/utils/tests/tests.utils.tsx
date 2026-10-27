import type { ReactElement, ReactNode } from 'react';
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

export * from '@testing-library/react-native';
