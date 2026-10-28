import { queryOptions } from '@tanstack/react-query';

import { devicesApi } from '@api/devices';

import { DEVICE_LIST_REFETCH_MS } from './devices.constants';

export const deviceKeys = {
  all: ['devices'] as const,
  lists: () => [...deviceKeys.all, 'list'] as const,
};

/**
 * `queryOptions` factories, used as `useQuery(deviceQueries.list())`. Each
 * passes TanStack Query's `signal` on, so a query nobody needs any more is
 * cancelled.
 */
export const deviceQueries = {
  /** Refetched every 30 s: `online` is only true while the board is connected. */
  list: () =>
    queryOptions({
      queryKey: deviceKeys.lists(),
      queryFn: ({ signal }) => devicesApi.list({ signal }),
      refetchInterval: DEVICE_LIST_REFETCH_MS,
    }),
};
