import { describe, expect, it } from 'vitest';
import { parseMacAddress } from '../devices.helpers';

describe('parseMacAddress', () => {
  it('accepts a colon-separated MAC in any case and returns it lower-case', () => {
    expect(parseMacAddress('AA:bb:CC:dd:EE:0f')).toBe('aa:bb:cc:dd:ee:0f');
  });

  it('rejects anything else', () => {
    for (const value of [
      '',
      'aabbccddeeff',
      'AA-BB-CC-DD-EE-FF',
      'AA:BB:CC:DD:EE',
      'AA:BB:CC:DD:EE:FF:00',
      'GG:BB:CC:DD:EE:FF',
      ' AA:BB:CC:DD:EE:FF',
    ]) {
      expect(parseMacAddress(value)).toBeNull();
    }
  });
});
