import type { ApiError } from '@app-types';

import { isSignedOutError } from './auth.helpers';

function apiError(overrides: Partial<ApiError>): ApiError {
  return {
    code: 'UNKNOWN_ERROR',
    message: 'Failed',
    isNetworkError: false,
    ...overrides,
  };
}

describe('isSignedOutError', () => {
  it('is true for a 401 with any code', () => {
    expect(
      isSignedOutError(
        apiError({ status: 401, code: 'INVALID_REFRESH_TOKEN' }),
      ),
    ).toBe(true);
    expect(
      isSignedOutError(apiError({ status: 401, code: 'UNAUTHORIZED' })),
    ).toBe(true);
  });

  it('is false for a network error', () => {
    expect(
      isSignedOutError(
        apiError({ code: 'NETWORK_ERROR', isNetworkError: true }),
      ),
    ).toBe(false);
  });

  it('is false for a server error', () => {
    expect(
      isSignedOutError(apiError({ status: 500, code: 'INTERNAL_ERROR' })),
    ).toBe(false);
  });

  it('is false for an invalid response', () => {
    expect(
      isSignedOutError(apiError({ status: 200, code: 'INVALID_RESPONSE' })),
    ).toBe(false);
  });
});
