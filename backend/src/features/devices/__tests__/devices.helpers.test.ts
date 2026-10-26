import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  generatePairingCode,
  hashPairingCode,
  parseMacAddress,
} from '../devices.helpers';

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

describe('generatePairingCode', () => {
  it('makes 8 characters of the pairing alphabet, different each time', () => {
    const codes = Array.from({ length: 1000 }, () => generatePairingCode());
    for (const code of codes) expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{8}$/);
    expect(new Set(codes).size).toBeGreaterThan(990);
  });
});

describe('hashPairingCode', () => {
  it('is the HMAC-SHA256 of the code under the secret', () => {
    expect(hashPairingCode('7K4MQ9TX', 's')).toBe(
      createHmac('sha256', 's').update('7K4MQ9TX').digest('hex'),
    );
  });

  it('depends on the secret', () => {
    expect(hashPairingCode('7K4MQ9TX', 's')).not.toBe(
      hashPairingCode('7K4MQ9TX', 't'),
    );
  });
});
