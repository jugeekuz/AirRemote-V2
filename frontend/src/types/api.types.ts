import type { ErrorCode } from '@airremote/contracts';

/** Failures that happen on the client, before or instead of a server reply. */
export type ClientErrorCode =
  'NETWORK_ERROR' | 'INVALID_RESPONSE' | 'REQUEST_CANCELLED' | 'UNKNOWN_ERROR';

export type ApiErrorCode = ErrorCode | ClientErrorCode;

/** The one error shape every API call rejects with (normalized by the http client). */
export type ApiError = {
  status?: number;
  code: ApiErrorCode;
  message: string;
  details?: { path: string; message: string }[];
  isNetworkError: boolean;
};

/** Passed by TanStack Query so in-flight requests are cancelled when they become irrelevant. */
export type RequestOptions = {
  signal?: AbortSignal;
};
