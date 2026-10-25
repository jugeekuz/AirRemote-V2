import { z } from 'zod';

const name = z.string().trim().min(1).max(100);

export const registerUserRequestSchema = z.object({
  email: z.email().max(254),
  firstName: name,
  lastName: name,
  password: z.string().min(8).max(128),
});

export type RegisterUserRequest = z.infer<typeof registerUserRequestSchema>;

export const userResponseSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  firstName: z.string(),
  lastName: z.string(),
  createdAt: z.iso.datetime(),
});

export type UserResponse = z.infer<typeof userResponseSchema>;
