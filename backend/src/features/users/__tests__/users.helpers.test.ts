import { describe, expect, it } from 'vitest';
import { hashPassword } from '../users.helpers';

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
