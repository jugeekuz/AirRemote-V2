import { learnButtonRequestSchema } from '@airremote/contracts';

/**
 * A name the server takes: 1 to 100 characters once trimmed, any
 * characters (V1 allowed only letters, digits, dashes and spaces). That it
 * is new on the remote only the server knows.
 */
export function isValidButtonName(name: string): boolean {
  return learnButtonRequestSchema.shape.name.safeParse(name).success;
}
