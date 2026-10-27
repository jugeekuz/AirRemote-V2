import { isAxiosError, isCancel } from 'axios';

import { errorResponseSchema } from '@airremote/contracts';

import type { ApiError } from '@app-types';

/** Whether a value already has the `ApiError` shape (e.g. thrown by the http client). */
export function isApiError(value: unknown): value is ApiError {
  return (
    typeof value === 'object' &&
    value !== null &&
    'code' in value &&
    typeof value.code === 'string' &&
    'message' in value &&
    typeof value.message === 'string' &&
    'isNetworkError' in value &&
    typeof value.isNetworkError === 'boolean'
  );
}

/** Normalizes anything thrown during a request into an `ApiError`. */
export function toApiError(error: unknown): ApiError {
  if (isApiError(error)) {
    return error;
  }
  // Before the axios check: a CanceledError is an AxiosError without a response.
  if (isCancel(error)) {
    return {
      code: 'REQUEST_CANCELLED',
      message: error.message,
      isNetworkError: false,
    };
  }
  if (isAxiosError(error)) {
    const { response } = error;
    if (!response) {
      return {
        code: 'NETWORK_ERROR',
        message: error.message,
        isNetworkError: true,
      };
    }
    const body = errorResponseSchema.safeParse(response.data);
    if (!body.success) {
      return {
        status: response.status,
        code: 'UNKNOWN_ERROR',
        message: error.message,
        isNetworkError: false,
      };
    }
    const { code, message, details } = body.data.error;
    return {
      status: response.status,
      code,
      message,
      ...(details && { details }),
      isNetworkError: false,
    };
  }
  return {
    code: 'UNKNOWN_ERROR',
    message: error instanceof Error ? error.message : String(error),
    isNetworkError: false,
  };
}
