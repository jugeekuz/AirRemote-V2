import '@i18n/config';

import type { ApiError, ApiErrorCode } from '@app-types';
import { alert } from '@ui';

import { notifyApiError } from './notify-api-error';

jest.mock('@ui', () => ({ alert: { error: jest.fn(), confirm: jest.fn() } }));

const alertError = jest.mocked(alert.error);

function apiError(code: ApiErrorCode, status?: number): ApiError {
  return {
    ...(status !== undefined && { status }),
    code,
    message: 'The server message, never shown',
    isNetworkError: false,
  };
}

beforeEach(() => {
  jest.resetAllMocks();
});

describe('notifyApiError', () => {
  it("shows a specific code's own text, even with a fallback", () => {
    notifyApiError(apiError('EMAIL_TAKEN', 409), 'Could not sign up');

    expect(alertError).toHaveBeenCalledTimes(1);
    expect(alertError).toHaveBeenCalledWith(
      'An account with this email already exists.',
    );
  });

  it("prefers the caller's fallback for a generic code", () => {
    notifyApiError(apiError('INTERNAL_ERROR', 500), 'Could not load devices');

    expect(alertError).toHaveBeenCalledWith('Could not load devices');
  });

  it("falls back to a generic code's own text", () => {
    notifyApiError(apiError('INVALID_RESPONSE', 200));

    expect(alertError).toHaveBeenCalledWith(
      'Got an unexpected response. Please try again.',
    );
  });

  it.each(['UNAUTHORIZED', 'INVALID_REFRESH_TOKEN'] as const)(
    'shows nothing for %s: the user is taken to Login',
    (code) => {
      notifyApiError(apiError(code, 401), 'Could not load devices');

      expect(alertError).not.toHaveBeenCalled();
    },
  );

  it('still shows a 401 that is not about the session', () => {
    notifyApiError(apiError('INVALID_CREDENTIALS', 401));

    expect(alertError).toHaveBeenCalledWith('Wrong email or password.');
  });
});
