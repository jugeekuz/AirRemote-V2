import { z } from 'zod';
import { nameSchema } from '../shared/names.contract';

export const learnButtonRequestSchema = z.object({ name: nameSchema });

export type LearnButtonRequest = z.output<typeof learnButtonRequestSchema>;

export const buttonResponseSchema = z.object({
  id: z.uuid(),
  remoteId: z.uuid(),
  name: z.string(),
});

export type ButtonResponse = z.infer<typeof buttonResponseSchema>;
