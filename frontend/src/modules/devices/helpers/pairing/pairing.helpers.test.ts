import {
  formatMacAddress,
  formatPairingCode,
  getPairingDetails,
  isValidDeviceName,
  isValidMacAddress,
  isValidPairingCode,
  parsePairingLink,
} from './pairing.helpers';

const MAC = 'AA:BB:CC:DD:EE:01';

describe('parsePairingLink', () => {
  it("reads the simulator's QR code", () => {
    expect(
      parsePairingLink(`airremote://pair?mac=${MAC}&code=7K4MQ9TX`),
    ).toEqual({ macAddress: MAC, pairingCode: '7K4MQ9TX' });
  });

  it('accepts lower-case hex and a code typed with a dash', () => {
    expect(
      parsePairingLink('airremote://pair?mac=aa:bb:cc:dd:ee:01&code=7k4m-q9tx'),
    ).toEqual({ macAddress: MAC, pairingCode: '7K4MQ9TX' });
  });

  it('accepts the parameters in any order, URL-encoded, around spaces', () => {
    expect(
      parsePairingLink(
        '  airremote://pair/?code=7K4MQ9TX&mac=AA%3ABB%3ACC%3ADD%3AEE%3A01\n',
      ),
    ).toEqual({ macAddress: MAC, pairingCode: '7K4MQ9TX' });
  });

  it.each([
    ['a web address', `https://example.com/pair?mac=${MAC}&code=7K4MQ9TX`],
    ['another scheme', `otherapp://pair?mac=${MAC}&code=7K4MQ9TX`],
    ['another host', `airremote://remotes?mac=${MAC}&code=7K4MQ9TX`],
    ['plain text', 'hello'],
    ['no parameters', 'airremote://pair'],
    ['no code', `airremote://pair?mac=${MAC}`],
    ['no MAC', 'airremote://pair?code=7K4MQ9TX'],
    ['a bad MAC', 'airremote://pair?mac=AA:BB:CC:DD:EE&code=7K4MQ9TX'],
    ['a MAC without colons', 'airremote://pair?mac=AABBCCDDEE01&code=7K4MQ9TX'],
    ['a short code', `airremote://pair?mac=${MAC}&code=7K4MQ9`],
    ['a code with U', `airremote://pair?mac=${MAC}&code=7K4MQ9TU`],
    ['a broken escape', `airremote://pair?mac=${MAC}&code=%E0%A4%A`],
  ])('rejects %s', (_, text) => {
    expect(parsePairingLink(text)).toBeNull();
  });
});

describe('getPairingDetails', () => {
  it('normalises a valid MAC address and code', () => {
    expect(getPairingDetails('aa:bb:cc:dd:ee:01', '7k4m q9tx')).toEqual({
      macAddress: MAC,
      pairingCode: '7K4MQ9TX',
    });
  });

  it.each([
    [undefined, '7K4MQ9TX'],
    [MAC, undefined],
    ['AA:BB', '7K4MQ9TX'],
    [MAC, '7K4M'],
  ])('rejects %j / %j', (macAddress, pairingCode) => {
    expect(getPairingDetails(macAddress, pairingCode)).toBeNull();
  });
});

describe('formatPairingCode', () => {
  it.each([
    ['7K4MQ9TX', '7K4M-Q9TX'],
    ['7k4m-q9tx', '7K4M-Q9TX'],
    ['7K4', '7K4'],
    ['7K4M', '7K4M'],
    ['7K4MQ', '7K4M-Q'],
    ['7K4M-', '7K4M'],
    ['7K4MQ9TXZZ', '7K4M-Q9TX'],
    ['', ''],
  ])('shows %j as %j', (code, shown) => {
    expect(formatPairingCode(code)).toBe(shown);
  });
});

describe('formatMacAddress', () => {
  it.each([
    ['aabbccddee01', MAC],
    ['aa:bb:cc:dd:ee:01', MAC],
    ['AA-BB-CC-DD-EE-01', MAC],
    ['AA', 'AA'],
    ['AA:', 'AA'],
    ['AAB', 'AA:B'],
    ['AA:BB:CC:DD:EE:01:02', MAC],
    ['zz', ''],
  ])('shows %j as %j', (text, shown) => {
    expect(formatMacAddress(text)).toBe(shown);
  });
});

describe('isValidDeviceName', () => {
  it.each(['Living room', ' a ', 'x'.repeat(100)])('accepts %j', (name) => {
    expect(isValidDeviceName(name)).toBe(true);
  });

  it.each(['', '   ', 'x'.repeat(101)])('rejects %j', (name) => {
    expect(isValidDeviceName(name)).toBe(false);
  });
});

describe('isValidMacAddress', () => {
  it.each([MAC, 'aa:bb:cc:dd:ee:01'])('accepts %j', (text) => {
    expect(isValidMacAddress(text)).toBe(true);
  });

  it.each(['', 'AA:BB', 'AABBCCDDEE01', 'GG:BB:CC:DD:EE:01'])(
    'rejects %j',
    (text) => {
      expect(isValidMacAddress(text)).toBe(false);
    },
  );
});

describe('isValidPairingCode', () => {
  it.each(['7K4MQ9TX', '7k4m-q9tx', '7K4M Q9TX'])('accepts %j', (text) => {
    expect(isValidPairingCode(text)).toBe(true);
  });

  it.each(['', '7K4M', '7K4MQ9TU', '7K4MQ9TXX'])('rejects %j', (text) => {
    expect(isValidPairingCode(text)).toBe(false);
  });
});
