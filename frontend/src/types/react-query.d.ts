import '@tanstack/react-query';

import type { ApiError } from './api.types';

type AppQueryMeta = Record<string, unknown> & {
  /** Fallback toast text when the server sends no userMessage. */
  errorMessage?: string;
  /** Skip the global error toast (the screen renders its own error UI). */
  silent?: boolean;
  /** Mutation only: show the blocking loading overlay while pending. */
  blocking?: boolean;
};

declare module '@tanstack/react-query' {
  interface Register {
    defaultError: ApiError;
    queryMeta: AppQueryMeta;
    mutationMeta: AppQueryMeta;
  }
}
