/** `7K4MQ9TX` → `7K4M-Q9TX`, easier to read off a screen. */
export function groupPairingCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

/** What the device's QR code carries. A proposal until a UI scans it. */
export function pairingUri(mac: string, code: string): string {
  return `airremote://pair?mac=${mac}&code=${code}`;
}

const CLOSE_REASONS: Record<number, string> = {
  1000: 'normal closure',
  1001: 'server shutting down',
  // No close frame: the connection was cut, e.g. by the server's heartbeat.
  1006: 'connection lost',
  1007: 'invalid UTF-8',
  1008: 'too many invalid messages',
  1009: 'message too big',
  4000: 'replaced by a newer connection',
  4001: 'device deleted by its owner',
};

export function describeClose(code: number): string {
  const reason = CLOSE_REASONS[code];
  return reason ? `${code} ${reason}` : String(code);
}

/** `M:SS`, never negative. */
export function formatRemaining(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

const SERVER_REJECTED_CERTIFICATE = [
  'ALERT_UNKNOWN_CA',
  'ALERT_BAD_CERTIFICATE',
  'ALERT_CERTIFICATE_REQUIRED',
];
const SERVER_CERTIFICATE_UNTRUSTED = [
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'ERR_TLS_CERT_ALTNAME_INVALID',
];

/** A network or TLS failure in plain words. */
export function describeTransportError(error: {
  code?: string;
  message: string;
}): string {
  const code = error.code ?? '';
  if (code === 'ECONNREFUSED') {
    return 'server not reachable (connection refused)';
  }
  // With TLS 1.3, a client certificate the server refuses usually shows up as
  // a reset rather than as a certificate alert.
  if (code === 'ECONNRESET') {
    return "connection reset by the server — it may not trust this device's certificate";
  }
  if (SERVER_REJECTED_CERTIFICATE.some((part) => code.includes(part))) {
    return "the server does not trust this device's certificate";
  }
  if (SERVER_CERTIFICATE_UNTRUSTED.includes(code)) {
    return "this device does not trust the server's certificate";
  }
  return error.message;
}
