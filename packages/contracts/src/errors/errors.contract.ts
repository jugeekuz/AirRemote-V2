import { z } from 'zod';

/** Machine-readable error codes. Clients switch on these, not on messages. */
export const errorCodeSchema = z.enum([
  'VALIDATION_FAILED',
  'BAD_REQUEST',
  'INVALID_CREDENTIALS',
  'INVALID_REFRESH_TOKEN',
  'NOT_FOUND',
  'EMAIL_TAKEN',
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
