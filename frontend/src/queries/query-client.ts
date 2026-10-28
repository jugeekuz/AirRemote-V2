import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';

import type { ApiError } from '@app-types';

import {
  DEFAULT_GC_TIME_MS,
  DEFAULT_STALE_TIME_MS,
  MAX_QUERY_RETRIES,
} from './queries.constants';

type ApiErrorHandler = (error: ApiError, fallbackMessage?: string) => void;

const HTTP_CLIENT_ERROR_MIN = 400;
const HTTP_CLIENT_ERROR_MAX = 499;

/** Repeating these cannot change the outcome. */
function isFinalError(error: ApiError): boolean {
  const isClientError =
    error.status !== undefined &&
    error.status >= HTTP_CLIENT_ERROR_MIN &&
    error.status <= HTTP_CLIENT_ERROR_MAX;

  return (
    isClientError ||
    error.code === 'INVALID_RESPONSE' ||
    error.code === 'REQUEST_CANCELLED'
  );
}

function shouldRetryQuery(failureCount: number, error: ApiError): boolean {
  if (isFinalError(error)) {
    return false;
  }
  return failureCount < MAX_QUERY_RETRIES;
}

/**
 * Builds a QueryClient. How errors are PRESENTED is injected so this layer
 * stays UI-free: the app passes an error notifier, tests pass nothing. A
 * cancelled request is not a failure the user needs to hear about.
 */
export function createQueryClient(
  onApiError: ApiErrorHandler = () => {},
): QueryClient {
  const report = (
    error: ApiError,
    meta: { silent?: boolean; errorMessage?: string } | undefined,
  ) => {
    if (meta?.silent || error.code === 'REQUEST_CANCELLED') {
      return;
    }
    onApiError(error, meta?.errorMessage);
  };

  return new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        report(error, query.meta);
      },
    }),
    mutationCache: new MutationCache({
      onError: (error, _variables, _context, mutation) => {
        report(error, mutation.meta);
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: DEFAULT_STALE_TIME_MS,
        gcTime: DEFAULT_GC_TIME_MS,
        retry: shouldRetryQuery,
      },
      mutations: { retry: false },
    },
  });
}
