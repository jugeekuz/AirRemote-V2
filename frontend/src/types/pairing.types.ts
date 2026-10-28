/** What a pairing code is for: the board's MAC address and its code. */
export type PairingDetails = {
  /** Upper-case and colon-separated: `AA:BB:CC:DD:EE:01`. */
  macAddress: string;
  /** The code as issued: 8 characters, no dash. */
  pairingCode: string;
};
