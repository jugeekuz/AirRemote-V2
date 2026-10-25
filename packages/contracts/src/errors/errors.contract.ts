import { z } from 'zod';

export const errorResponseSchema = z.object({
  statusCode: z.number().int(),
  error: z.string(),
  message: z.string(),
  details: z
    .array(z.object({ path: z.string(), message: z.string() }))
    .optional(),
});

export type ErrorResponse = z.infer<typeof errorResponseSchema>;
