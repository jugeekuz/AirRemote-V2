import { queryOptions } from '@tanstack/react-query';

import { deviceCommandsApi } from '@api/device-commands';

import { DEVICE_COMMAND_POLL_MS } from './device-commands.constants';

export const deviceCommandKeys = {
  all: ['device-commands'] as const,
  details: () => [...deviceCommandKeys.all, 'detail'] as const,
  detail: (id: string) => [...deviceCommandKeys.details(), id] as const,
};

/**
 * `queryOptions` factories, used as `useQuery(deviceCommandQueries.detail(id))`.
 * Each passes TanStack Query's `signal` on, so a query nobody needs any more
 * is cancelled.
 */
export const deviceCommandQueries = {
  /**
   * Polled while the device has not answered, then left alone: a command
   * that `succeeded`, `failed` or `expired` never changes again, and a poll
   * that failed for good (after the query's retries) is not repeated.
   * Silent: the screen waiting for the command shows its failure itself.
   */
  detail: (id: string) =>
    queryOptions({
      queryKey: deviceCommandKeys.detail(id),
      queryFn: ({ signal }) => deviceCommandsApi.get(id, { signal }),
      // Asked offline too, so the wait ends with NETWORK_ERROR instead of
      // pausing until the network is back.
      networkMode: 'always',
      refetchInterval: (query) =>
        query.state.status !== 'error' && query.state.data?.status === 'pending'
          ? DEVICE_COMMAND_POLL_MS
          : false,
      meta: { silent: true },
    }),
};
