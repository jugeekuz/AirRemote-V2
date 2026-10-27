import {
  AxiosError,
  AxiosHeaders,
  CanceledError,
  type InternalAxiosRequestConfig,
} from 'axios';

import type { ApiError } from '@app-types';

import { isApiError, toApiError } from './api-error';

const config: InternalAxiosRequestConfig = { headers: new AxiosHeaders() };

/** An error the way axios rejects for a response with this status and body. */
function responseError(status: number, data: unknown): AxiosError {
  return new AxiosError(
    `Request failed with status code ${status}`,
    AxiosError.ERR_BAD_RESPONSE,
    config,
    {},
    { status, statusText: '', headers: {}, config, data },
  );
}

describe('toApiError', () => {
  it('reads the server error envelope', () => {
    const body = { error: { code: 'EMAIL_TAKEN', message: 'Email taken' } };
    expect(toApiError(responseError(409, body))).toEqual({
      status: 409,
      code: 'EMAIL_TAKEN',
      message: 'Email taken',
      isNetworkError: false,
    });

    const details = [{ path: 'email', message: 'Invalid email' }];
    const withDetails = {
      error: { code: 'VALIDATION_FAILED', message: 'Invalid body', details },
    };
    expect(toApiError(responseError(400, withDetails))).toEqual({
      status: 400,
      code: 'VALIDATION_FAILED',
      message: 'Invalid body',
      details,
      isNetworkError: false,
    });
  });

  it('treats a request without a response as a network error', () => {
    const error = new AxiosError(
      'Network Error',
      AxiosError.ERR_NETWORK,
      config,
      {},
    );
    const apiError = toApiError(error);
    expect(apiError).toMatchObject({
      code: 'NETWORK_ERROR',
      isNetworkError: true,
    });
    expect(apiError.status).toBeUndefined();
  });

  it('treats a cancelled request as cancelled, not offline', () => {
    expect(toApiError(new CanceledError())).toMatchObject({
      code: 'REQUEST_CANCELLED',
      isNetworkError: false,
    });
  });

  it('falls back to UNKNOWN_ERROR for a body that is not the envelope', () => {
    expect(toApiError(responseError(502, '<html>'))).toMatchObject({
      status: 502,
      code: 'UNKNOWN_ERROR',
      isNetworkError: false,
    });
  });

  it('wraps anything else', () => {
    expect(toApiError(new Error('boom'))).toEqual({
      code: 'UNKNOWN_ERROR',
      message: 'boom',
      isNetworkError: false,
    });
  });

  it('returns an ApiError unchanged', () => {
    const apiError: ApiError = {
      status: 401,
      code: 'UNAUTHORIZED',
      message: 'Missing token',
      isNetworkError: false,
    };
    expect(toApiError(apiError)).toBe(apiError);
  });
});

describe('isApiError', () => {
  it('recognizes the ApiError shape', () => {
    expect(
      isApiError({ code: 'NETWORK_ERROR', message: 'x', isNetworkError: true }),
    ).toBe(true);
  });

  it('rejects other values', () => {
    expect(isApiError(new Error('boom'))).toBe(false);
    expect(isApiError(responseError(500, {}))).toBe(false);
    expect(isApiError(null)).toBe(false);
    expect(isApiError('UNAUTHORIZED')).toBe(false);
  });
});
