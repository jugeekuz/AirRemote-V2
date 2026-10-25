import { randomBytes, scrypt } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: string,
  keylen: number,
) => Promise<Buffer>;

const KEY_LENGTH = 64;
const SALT_BYTES = 16;

export type PasswordHash = { hash: string; salt: string };

/** Hashes a password with scrypt. Pass the stored salt to reproduce a stored hash. */
export async function hashPassword(
  password: string,
  salt: string = randomBytes(SALT_BYTES).toString('hex'),
): Promise<PasswordHash> {
  const key = await scryptAsync(password, salt, KEY_LENGTH);
  return { hash: key.toString('hex'), salt };
}
