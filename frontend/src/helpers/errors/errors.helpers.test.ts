import { GENERIC_ERROR_CODES } from './errors.constants';
import { isGenericErrorCode } from './errors.helpers';

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
