const MAC_ADDRESS = /^[0-9a-f]{2}(:[0-9a-f]{2}){5}$/i;

/** Returns a colon-separated MAC address in lower case, or null if the value is not one. */
export function parseMacAddress(value: string): string | null {
  return MAC_ADDRESS.test(value) ? value.toLowerCase() : null;
}
