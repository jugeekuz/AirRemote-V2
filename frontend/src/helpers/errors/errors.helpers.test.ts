import { GENERIC_ERROR_CODES } from './errors.constants';
import { isGenericErrorCode, isSessionErrorCode } from './errors.helpers';

describe('isGenericErrorCode', () => {
  it.each(GENERIC_ERROR_CODES)('is true for %s', (code) => {
    expect(isGenericErrorCode(code)).toBe(true);
  });

  it('lists the codes whose message says nothing specific', () => {
    expect([...GENERIC_ERROR_CODES].sort()).toEqual([
      'BAD_REQUEST',
      'INTERNAL_ERROR',
      'INVALID_RESPONSE',
      'UNKNOWN_ERROR',
      'VALIDATION_FAILED',
    ]);
  });

  it('is false for a specific code', () => {
    expect(isGenericErrorCode('INVALID_CREDENTIALS')).toBe(false);
  });
});

describe('isSessionErrorCode', () => {
  it.each(['UNAUTHORIZED', 'INVALID_REFRESH_TOKEN'] as const)(
    'is true for %s, which only arrives once the session ended',
    (code) => {
      expect(isSessionErrorCode(code)).toBe(true);
    },
  );

  it.each(['NETWORK_ERROR', 'NOT_FOUND', 'DEVICE_OFFLINE'] as const)(
    'is false for %s',
    (code) => {
      expect(isSessionErrorCode(code)).toBe(false);
    },
  );
});
