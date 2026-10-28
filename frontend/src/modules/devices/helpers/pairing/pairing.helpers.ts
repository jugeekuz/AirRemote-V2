import {
  enrollDeviceRequestSchema,
  macAddressSchema,
  normalisePairingCode,
  PAIRING_CODE_LENGTH,
  pairingCodeInputSchema,
} from '@airremote/contracts';

import type { PairingDetails } from '@app-types';

import {
  MAC_ADDRESS_HEX_LENGTH,
  PAIRING_CODE_GROUP_LENGTH,
  PAIRING_LINK_PARAM,
  PAIRING_LINK_PATTERN,
} from './pairing.constants';

/**
 * The MAC address and code when both are valid (the contract's rules), in
 * the form the app keeps them: an upper-case MAC and the code as issued.
 */
export function getPairingDetails(
  macAddress: string | undefined,
  pairingCode: string | undefined,
): PairingDetails | null {
  const mac = macAddressSchema.safeParse(macAddress);
  const code = pairingCodeInputSchema.safeParse(pairingCode);
  if (!mac.success || !code.success) {
    return null;
  }
  return { macAddress: mac.data.toUpperCase(), pairingCode: code.data };
}

function decode(value: string): string | undefined {
  try {
    return decodeURIComponent(value);
  } catch {
    return undefined;
  }
}

/** A query string's values by name; the first of a repeated name wins. */
function getQueryParams(query: string): Map<string, string | undefined> {
  const params = new Map<string, string | undefined>();
  for (const pair of query.split('&')) {
    const separator = pair.indexOf('=');
    const name = separator === -1 ? pair : pair.slice(0, separator);
    const value = separator === -1 ? '' : pair.slice(separator + 1);
    if (!params.has(name)) {
      params.set(name, decode(value));
    }
  }
  return params;
}

/**
 * The board and code a scanned QR code points to
 * (`airremote://pair?mac=<MAC>&code=<CODE>`), or `null` when the text is
 * not a valid AirRemote pairing link.
 */
export function parsePairingLink(text: string): PairingDetails | null {
  const query = PAIRING_LINK_PATTERN.exec(text.trim())?.[1];
  if (query === undefined) {
    return null;
  }
  const params = getQueryParams(query);
  return getPairingDetails(
    params.get(PAIRING_LINK_PARAM.MAC_ADDRESS),
    params.get(PAIRING_LINK_PARAM.PAIRING_CODE),
  );
}

/**
 * A code as the board prints it, `7K4M-Q9TX`, from whatever was typed so
 * far: normalised (upper-case, `O` → `0`, `I`/`L` → `1`), at most 8
 * characters, with the dash once the second group starts.
 */
export function formatPairingCode(code: string): string {
  const normalised = normalisePairingCode(code).slice(0, PAIRING_CODE_LENGTH);
  return normalised.length > PAIRING_CODE_GROUP_LENGTH
    ? `${normalised.slice(0, PAIRING_CODE_GROUP_LENGTH)}-${normalised.slice(PAIRING_CODE_GROUP_LENGTH)}`
    : normalised;
}

/**
 * A MAC address as typed so far, in `AA:BB:CC:DD:EE:FF` form: hex digits
 * only, upper-case, at most six bytes, a colon between complete bytes.
 */
export function formatMacAddress(text: string): string {
  const hex = text
    .replace(/[^0-9a-f]/gi, '')
    .toUpperCase()
    .slice(0, MAC_ADDRESS_HEX_LENGTH);
  return hex.match(/.{1,2}/g)?.join(':') ?? '';
}

/** A device name the server takes: 1 to 100 characters once trimmed. */
export function isValidDeviceName(name: string): boolean {
  return enrollDeviceRequestSchema.shape.name.safeParse(name).success;
}

/** A MAC address the server takes: `AA:BB:CC:DD:EE:FF`, either case. */
export function isValidMacAddress(text: string): boolean {
  return macAddressSchema.safeParse(text).success;
}

/** A pairing code the server takes once normalised (`7k4m-q9tx` too). */
export function isValidPairingCode(text: string): boolean {
  return pairingCodeInputSchema.safeParse(text).success;
}
