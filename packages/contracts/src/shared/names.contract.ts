import { z } from 'zod';

/** A user-given name (remote, button): 1-100 characters after trimming. */
export const nameSchema = z.string().trim().min(1).max(100);
