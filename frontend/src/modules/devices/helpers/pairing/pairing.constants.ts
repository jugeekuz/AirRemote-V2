/**
 * What a board's QR code carries (the simulator prints it):
 * `airremote://pair?mac=<MAC>&code=<CODE>`. The scheme and host may be in
 * any case, with or without a slash before the query.
 */
export const PAIRING_LINK_PATTERN = /^airremote:\/\/pair\/?\?(.*)$/i;

/** The query parameters of a pairing link. */
export const PAIRING_LINK_PARAM = Object.freeze({
  MAC_ADDRESS: 'mac',
  PAIRING_CODE: 'code',
} as const);

/** A code is shown in two groups of this many characters: `7K4M-Q9TX`. */
export const PAIRING_CODE_GROUP_LENGTH = 4;

/** A MAC address has six bytes of two hex digits. */
export const MAC_ADDRESS_HEX_LENGTH = 12;

/** The longest a typed MAC address gets: `AA:BB:CC:DD:EE:FF`. */
export const MAC_ADDRESS_INPUT_LENGTH = 17;

/** The longest a typed code gets, with its dash: `7K4M-Q9TX`. */
export const PAIRING_CODE_INPUT_LENGTH = 9;
