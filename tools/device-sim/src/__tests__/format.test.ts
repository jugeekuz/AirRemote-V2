import { describe, expect, it } from 'vitest';
import {
  describeClose,
  describeTransportError,
  formatRemaining,
  groupPairingCode,
  pairingUri,
} from '../format';

describe('groupPairingCode', () => {
  it('splits the code in two groups of four', () => {
    expect(groupPairingCode('7K4MQ9TX')).toBe('7K4M-Q9TX');
  });
});

describe('pairingUri', () => {
  it('carries the MAC and the code', () => {
    expect(pairingUri('AA:BB:CC:DD:EE:01', '7K4MQ9TX')).toBe(
      'airremote://pair?mac=AA:BB:CC:DD:EE:01&code=7K4MQ9TX',
    );
  });
});

describe('describeClose', () => {
  it.each([
    [1000, '1000 normal closure'],
    [1001, '1001 server shutting down'],
    [1006, '1006 connection lost'],
    [1007, '1007 invalid UTF-8'],
    [1008, '1008 too many invalid messages'],
    [1009, '1009 message too big'],
    [4000, '4000 replaced by a newer connection'],
    [4001, '4001 device deleted by its owner'],
    [4999, '4999'],
  ])('describes %i', (code, text) => {
    expect(describeClose(code)).toBe(text);
  });
});

describe('formatRemaining', () => {
  it.each([
    [900_000, '15:00'],
    [61_000, '1:01'],
    [999, '0:00'],
    [-5_000, '0:00'],
  ])('formats %i ms as %s', (ms, text) => {
    expect(formatRemaining(ms)).toBe(text);
  });
});

describe('describeTransportError', () => {
  const notTrusted = "the server does not trust this device's certificate";
  const notTrusting = "this device does not trust the server's certificate";

  it.each([
    ['ECONNREFUSED', 'server not reachable (connection refused)'],
    [
      'ECONNRESET',
      "connection reset by the server — it may not trust this device's certificate",
    ],
    ['ERR_SSL_TLSV1_ALERT_UNKNOWN_CA', notTrusted],
    ['ERR_SSL_SSLV3_ALERT_BAD_CERTIFICATE', notTrusted],
    ['ERR_SSL_TLSV13_ALERT_CERTIFICATE_REQUIRED', notTrusted],
    ['DEPTH_ZERO_SELF_SIGNED_CERT', notTrusting],
    ['SELF_SIGNED_CERT_IN_CHAIN', notTrusting],
    ['UNABLE_TO_VERIFY_LEAF_SIGNATURE', notTrusting],
    ['ERR_TLS_CERT_ALTNAME_INVALID', notTrusting],
  ])('explains %s', (code, text) => {
    expect(describeTransportError({ code, message: 'raw' })).toBe(text);
  });

  it('falls back to the message', () => {
    expect(
      describeTransportError({ code: 'EWHATEVER', message: 'socket hang up' }),
    ).toBe('socket hang up');
  });
});
