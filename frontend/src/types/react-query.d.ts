import '@tanstack/react-query';

import type { ApiError } from './api.types';

type AppQueryMeta = Record<string, unknown> & {
  /**
   * Error text used when the code has no specific message (a generic
   * code, see `isGenericErrorCode`). The server's message is never shown.
   */
  errorMessage?: string;
  /** Skip the global Error dialog (the screen renders its own error UI). */
  silent?: boolean;
  /** Reserved for a blocking loading overlay on mutations; nothing reads it yet. */
  blocking?: boolean;
};

declare module '@tanstack/react-query' {
  interface Register {
    defaultError: ApiError;
    queryMeta: AppQueryMeta;
    mutationMeta: AppQueryMeta;
  }
}
