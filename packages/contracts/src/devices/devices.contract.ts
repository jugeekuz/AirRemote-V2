import { z } from 'zod';

/** Crockford's base32: no I, L, O or U, so a code can be typed by hand. */
export const PAIRING_CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const PAIRING_CODE_LENGTH = 8;

const pairingCode = z
  .string()
  .regex(
    /^[0-9A-HJKMNP-TV-Z]{8}$/,
    `must be ${PAIRING_CODE_LENGTH} characters of ${PAIRING_CODE_ALPHABET}`,
  );

/** Puts a typed code in its issued form; does not validate it. */
export function normalisePairingCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
}

export const macAddressSchema = z
  .string()
  .regex(
    /^[0-9a-f]{2}(:[0-9a-f]{2}){5}$/i,
    'must be a MAC address like AA:BB:CC:DD:EE:FF',
  );

export const pairingCodeInputSchema = z
  .string()
  .max(32)
  .transform(normalisePairingCode)
  .pipe(pairingCode);

export const enrollDeviceRequestSchema = z.object({
  macAddress: macAddressSchema,
  pairingCode: pairingCodeInputSchema,
  name: z.string().trim().min(1).max(100),
});

export type EnrollDeviceRequest = z.output<typeof enrollDeviceRequestSchema>;

export const deviceResponseSchema = z.object({
  id: z.uuid(),
  macAddress: z.string(),
  name: z.string(),
});

export type DeviceResponse = z.infer<typeof deviceResponseSchema>;

export const pairingCodeResponseSchema = z.object({
  pairingCode,
  expiresAt: z.iso.datetime(),
});

export type PairingCodeResponse = z.infer<typeof pairingCodeResponseSchema>;
