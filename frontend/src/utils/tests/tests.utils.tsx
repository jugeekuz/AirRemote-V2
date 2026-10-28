import type { ReactElement, ReactNode } from 'react';
import { View } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  fireEvent,
  render,
  screen,
  type RenderOptions,
} from '@testing-library/react-native';

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

/**
 * Opens the kit's `Select` named `name` (a combobox) and lets its options
 * take presses. The list takes presses once it has been laid out on the
 * screen, which Jest never does, so the list's content (the nearest view
 * above an option that listens for its layout) is given a frame. A layout
 * event does not bubble in React Native, so it goes to that view itself.
 * Needs `mockViewMeasure()`.
 */
export async function openSelect(name: string) {
  await act(async () => {
    fireEvent.press(screen.getByRole('combobox', { name }));
  });
  const [option] = await screen.findAllByRole('option');
  if (!option) {
    throw new Error(`The select "${name}" has no options.`);
  }
  let content = option.parent;
  while (content && typeof content.props.onLayout !== 'function') {
    content = content.parent;
  }
  if (!content) {
    throw new Error(`The select "${name}" has no laid-out list.`);
  }
  const list = content;
  await act(async () => {
    fireEvent(list, 'layout', {
      nativeEvent: { layout: { x: 0, y: 64, width: 320, height: 80 } },
    });
  });
}

export * from '@testing-library/react-native';
