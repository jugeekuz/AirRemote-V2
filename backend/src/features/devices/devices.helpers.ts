import { createHmac, randomInt } from 'node:crypto';
import {
  PAIRING_CODE_ALPHABET,
  PAIRING_CODE_LENGTH,
} from '@airremote/contracts';

const MAC_ADDRESS = /^[0-9a-f]{2}(:[0-9a-f]{2}){5}$/i;

export const PAIRING_CODE_TTL_MS = 15 * 60 * 1000;

/** Returns a colon-separated MAC address in lower case, or null if the value is not one. */
export function parseMacAddress(value: string): string | null {
  return MAC_ADDRESS.test(value) ? value.toLowerCase() : null;
}

export function generatePairingCode(): string {
  return Array.from(
    { length: PAIRING_CODE_LENGTH },
    () => PAIRING_CODE_ALPHABET[randomInt(PAIRING_CODE_ALPHABET.length)],
  ).join('');
}

/** Keyed, so a stolen table cannot be brute-forced back into live codes. Expects a normalised code. */
export function hashPairingCode(code: string, secret: string): string {
  return createHmac('sha256', secret).update(code).digest('hex');
}
