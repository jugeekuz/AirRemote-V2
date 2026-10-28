import { queryOptions } from '@tanstack/react-query';

import { remotesApi } from '@api/remotes';

export const remoteKeys = {
  all: ['remotes'] as const,
  lists: () => [...remoteKeys.all, 'list'] as const,
};

/**
 * `queryOptions` factories, used as `useQuery(remoteQueries.list())`. Each
 * passes TanStack Query's `signal` on, so a query nobody needs any more is
 * cancelled.
 */
export const remoteQueries = {
  /**
   * Not polled: remotes change only when the user changes them. Screens
   * refresh it when they regain focus.
   */
  list: () =>
    queryOptions({
      queryKey: remoteKeys.lists(),
      queryFn: ({ signal }) => remotesApi.list({ signal }),
    }),
};
