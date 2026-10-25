import { z } from 'zod';

export const loginRequestSchema = z.object({
  email: z.email().max(254),
  password: z.string().min(1).max(128),
});

export type LoginRequest = z.infer<typeof loginRequestSchema>;

/** Returned by login and refresh. The refresh token travels only in its cookie. */
export const accessTokenResponseSchema = z.object({
  accessToken: z.string(),
  tokenType: z.literal('Bearer'),
  /** Seconds until the access token expires. */
  expiresIn: z.number().int().positive(),
});

export type AccessTokenResponse = z.infer<typeof accessTokenResponseSchema>;
