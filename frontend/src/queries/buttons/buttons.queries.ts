import { queryOptions } from '@tanstack/react-query';

import { buttonsApi } from '@api/buttons';

export const buttonKeys = {
  all: ['buttons'] as const,
  lists: () => [...buttonKeys.all, 'list'] as const,
  list: (remoteId: string) => [...buttonKeys.lists(), remoteId] as const,
};

/**
 * `queryOptions` factories, used as `useQuery(buttonQueries.list(remoteId))`.
 * Each passes TanStack Query's `signal` on, so a query nobody needs any more
 * is cancelled.
 */
export const buttonQueries = {
  /**
   * One remote's buttons. Not polled: buttons change only when the user
   * learns or deletes one. Screens refresh it when they regain focus.
   */
  list: (remoteId: string) =>
    queryOptions({
      queryKey: buttonKeys.list(remoteId),
      queryFn: ({ signal }) => buttonsApi.list(remoteId, { signal }),
    }),
};
