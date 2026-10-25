import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../password';

describe('hashPassword', () => {
  it('returns a hex hash and a random 16-byte hex salt', async () => {
    const { hash, salt } = await hashPassword('correct horse');
    expect(hash).toMatch(/^[0-9a-f]{128}$/);
    expect(salt).toMatch(/^[0-9a-f]{32}$/);
    expect(hash).not.toContain('correct horse');
  });

  it('uses a different salt, and so a different hash, every time', async () => {
    const first = await hashPassword('correct horse');
    const second = await hashPassword('correct horse');
    expect(first.salt).not.toBe(second.salt);
    expect(first.hash).not.toBe(second.hash);
  });

  it('reproduces the same hash for the same password and salt', async () => {
    const { hash, salt } = await hashPassword('correct horse');
    expect((await hashPassword('correct horse', salt)).hash).toBe(hash);
    expect((await hashPassword('wrong horse', salt)).hash).not.toBe(hash);
  });
});

describe('verifyPassword', () => {
  it('accepts the password that produced the stored hash', async () => {
    const { hash, salt } = await hashPassword('correct horse');
    expect(await verifyPassword('correct horse', hash, salt)).toBe(true);
  });

  it('rejects a different password', async () => {
    const { hash, salt } = await hashPassword('correct horse');
    expect(await verifyPassword('wrong horse', hash, salt)).toBe(false);
  });

  it('rejects, without throwing, a stored hash of the wrong length', async () => {
    const { salt } = await hashPassword('correct horse');
    expect(await verifyPassword('correct horse', 'abcd', salt)).toBe(false);
  });
});
