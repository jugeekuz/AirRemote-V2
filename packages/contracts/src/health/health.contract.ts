import { z } from 'zod';

export const healthResponseSchema = z.object({
  status: z.enum(['ok', 'unavailable']),
  database: z.enum(['up', 'down']),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
