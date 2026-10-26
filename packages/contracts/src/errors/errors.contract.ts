import { z } from 'zod';

/** Machine-readable error codes. Clients switch on these, not on messages. */
export const errorCodeSchema = z.enum([
  'VALIDATION_FAILED',
  'BAD_REQUEST',
  'INVALID_CREDENTIALS',
  'INVALID_REFRESH_TOKEN',
  'NOT_FOUND',
  'EMAIL_TAKEN',
  'UNAUTHORIZED',
  'INVALID_PAIRING_CODE',
  'DEVICE_ALREADY_REGISTERED',
  'REMOTE_NAME_TAKEN',
  'BUTTON_NAME_TAKEN',
  'DEVICE_OFFLINE',
  'DEVICE_BUSY',
  'IR_READ_TIMEOUT',
  'IR_CODE_TOO_LONG',
  'DEVICE_ERROR',
  'DEVICE_NOT_RESPONDING',
  'INVALID_DEVICE_CERTIFICATE',
  'INTERNAL_ERROR',
]);

export type ErrorCode = z.infer<typeof errorCodeSchema>;

/** Every error response body: `{ error: { code, message, details? } }`. */
export const errorResponseSchema = z.object({
  error: z.object({
    code: errorCodeSchema,
    message: z.string(),
    details: z
      .array(z.object({ path: z.string(), message: z.string() }))
      .optional(),
  }),
});

export type ErrorResponse = z.infer<typeof errorResponseSchema>;
